// WhatsApp Business API against e2e/fake-whatsapp.mjs. Needs the dev server started with the WHATSAPP_* variables in e2e/up.sh.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { chromium } from "./lib.mjs";
const BASE = "http://localhost:3000", OUT = process.env.OUT ?? "e2e/shots";
const DB = `postgresql://postgres@localhost:54330/postgres?host=${process.cwd()}/.e2e/pg`;
const sql = (q) => execFileSync("psql", [DB, "-qAtc", q], { encoding: "utf8" }).trim();
const sent = async () => (await fetch("http://127.0.0.1:54332/__sent")).json();
const browser = await chromium.launch();
const problems = [];
async function session(email, w = 1280) {
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${email} pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("hydrated but some attributes") && problems.push(`${email} console ${m.text().slice(0, 200)}`));
  await page.goto(BASE + "/login");
  await page.fill("#email", email); await page.fill("#password", "pw");
  await page.click("button:has-text('כניסה')"); await page.waitForURL(BASE + "/");
  return page;
}
async function visit(page, path, who, expect) {
  const r = await page.goto(BASE + path);
  const body = await page.textContent("body");
  if (r.status() >= 400 || /Application error|Internal Server Error/.test(body) || (expect && !body.includes(expect)))
    problems.push(`${who} ${path} ${r.status()} missing="${expect ?? ""}" url=${page.url()} :: ${body.slice(0, 200).replace(/\s+/g, " ")}`);
  return body;
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const check = (cond, msg) => { if (!cond) problems.push(msg); };
async function webhook(statuses, secret = "e2e-app-secret") {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { statuses } }] }] });
  const sig = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  return fetch(BASE + "/api/whatsapp/webhook", { method: "POST", body, headers: { "content-type": "application/json", "x-hub-signature-256": sig } });
}

// ---- admin: connection, automatic sends, test message
const a = await session("u1@test.local");
const settings = await visit(a, "/settings?tab=whatsapp", "admin", "מחובר");
check(settings.includes("e2e-verify-token") && settings.includes("/api/whatsapp/webhook"), "webhook address or token missing");
for (const k of ["wa_auto_confirm", "wa_auto_transit", "wa_auto_delivered"]) await a.check(`input[name=${k}]`);
await a.click("button:has-text('שמירה')");
await a.waitForSelector("text=נשמר.");
await a.fill("input[name=phone]", "050-1234567");
await a.click("button:has-text('שליחת בדיקה')");
await a.waitForSelector("text=נשלחה הודעת בדיקה");
check((await sent()).at(-1)?.template?.name === "hello_world", "test message not sent as hello_world");
await shot(a, "s4-01-whatsapp-settings");

// ---- marketer: a new order sends the confirmation automatically
const mk = await session("u2@test.local");
const cust = sql("select id from customers where name = 'קפה נחת'");
await visit(mk, `/orders/new?customer=${cust}`, "marketer", "הזמנה חדשה");
await mk.locator("select").filter({ has: mk.locator("option", { hasText: "בחרו מוצר…" }) }).first().selectOption({ index: 1 });
await mk.click("button:has-text('יצירת הזמנה')");
await mk.waitForURL(/orders\/\d+\?created=1&wa=sent/);
const orderId = Number(new URL(mk.url()).pathname.split("/").pop());
await mk.waitForSelector("text=אישור ההזמנה נשלח ללקוח בוואטסאפ");
const confirm = (await sent()).at(-1);
check(confirm.template.name === "order_confirmation" && confirm.template.language.code === "he", "confirmation template wrong");
const params = confirm.template.components[0].parameters.map((p) => p.text);
check(params.length === 6 && params[2] === String(orderId) && !params.some((p) => /\n/.test(p)), "confirmation params wrong: " + JSON.stringify(params));
check(confirm.to === "972500000205", "sent to wrong number " + confirm.to);
await shot(mk, "s4-02-order-auto-sent");

// ---- Meta reports delivered, then read; a bad signature is refused
check((await webhook([{ id: confirm.id, status: "read" }], "wrong")).status === 401, "bad signature accepted");
await webhook([{ id: confirm.id, status: "delivered" }]);
await webhook([{ id: confirm.id, status: "read" }]);
await visit(mk, `/orders/${orderId}`, "marketer", "נקראה");
check(sql(`select status from whatsapp_messages where wa_message_id = '${confirm.id}'`) === "read", "status not read");

// ---- a number Meta refuses: the failure is shown and logged
sql(`update customers set phone = '050-0000000' where id = '${cust}'`);
await mk.click("button:has-text('שליחת אישור הזמנה')");
await mk.waitForSelector("text=השליחה נכשלה");
await mk.reload();
check((await mk.textContent("body")).includes("not in allowed list"), "failure reason not shown");
await shot(mk, "s4-03-order-failed");
sql(`update customers set phone = '050-0000205' where id = '${cust}'`);

// ---- warehouse: leaving and delivering message the customer automatically
sql(`update order_items set produced_quantity = quantity where order_id = ${orderId}; update orders set status = 'ready_for_delivery' where id = ${orderId};`);
const wh = await session("u6@test.local");
await visit(wh, "/deliveries", "warehouse", "מוכנות למשלוח");
const row = wh.locator("li", { has: wh.locator(`a[href='/orders/${orderId}']`) });
await row.locator("input[name=courier_name]").fill("גט טקסי");
await row.locator("button:has-text('שיבוץ')").click();
await wh.waitForSelector("text=השליח שובץ.");
await row.locator("button:has-text('יצא לאספקה')").click();
await wh.waitForSelector("text=בדרך (1)");
const transit = (await sent()).at(-1);
check(transit.template.name === "order_on_the_way" && transit.template.components[0].parameters[2].text === "גט טקסי", "transit message wrong");
await row.locator("button:has-text('נמסר ללקוח')").click();
await wh.waitForSelector("text=נמסרו ביומיים האחרונים (1)");
check((await sent()).at(-1).template.name === "order_delivered", "delivered message not sent");
await visit(wh, `/orders/${orderId}`, "warehouse", "ההזמנה נמסרה");
await shot(wh, "s4-04-order-messages");

// ---- stock: one message per supplier
await visit(wh, "/inventory", "warehouse", "שליחה בוואטסאפ עסקי");
await wh.locator("button:has-text('שליחת הזמנה ל')").first().click();
await wh.waitForSelector("text=ההזמנה נשלחה לספק.");
const sup = (await sent()).at(-1);
check(sup.template.name === "supplier_order" && sup.template.components[0].parameters[1].text.length > 3, "supplier message wrong");
await shot(wh, "s4-05-inventory-supplier");

// ---- a production worker sees no send buttons
const wk = await session("u5@test.local");
const body = await visit(wk, `/orders/${orderId}`, "worker");
check(!body.includes("שליחת אישור הזמנה") && !body.includes("הודעה: ההזמנה"), "worker sees send buttons");

await browser.close();
if (problems.length) { console.log("PROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log("NO PROBLEMS");
