import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, gotoGuarded } from "./lib.mjs";
const BASE = "http://localhost:3000", OUT = process.env.OUT ?? "e2e/shots";
const DB = `postgresql://postgres@localhost:54330/postgres?host=${process.cwd()}/.e2e/pg`;
const sql = (q) => execFileSync("psql", [DB, "-qAtc", q], { encoding: "utf8" }).trim();
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
  if (r.status() >= 400 || /Application error|Internal Server Error|נכשלה/.test(body) || (expect && !body.includes(expect)))
    problems.push(`${who} ${path} ${r.status()} missing="${expect ?? ""}" url=${page.url()} :: ${body.slice(0, 200).replace(/\s+/g, " ")}`);
  return body;
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const check = (cond, msg) => { if (!cond) problems.push(msg); };

// ---- two orders become ready: 1044 goes by courier, 1048 is a self pick-up
sql(`update order_items set produced_quantity = quantity where order_id in (1044, 1048);
     update orders set status = 'ready_for_delivery' where id in (1044, 1048);
     update orders set address_id = null where id = 1048;`);

// ---- warehouse: courier, departure, return, hand-over
const wh = await session("u6@test.local");
await visit(wh, "/deliveries", "warehouse", "מוכנות למשלוח (2)"); await shot(wh, "s3-01-deliveries");
const row = (id) => wh.locator("li", { has: wh.locator(`a[href='/orders/${id}']`) });
await row(1044).locator("select[name=courier]").selectOption({ index: 1 });
await row(1044).locator("button:has-text('שיבוץ')").click();
await wh.waitForSelector("text=השליח שובץ.");
await row(1044).locator("button:has-text('יצא לאספקה')").click();
await wh.waitForSelector("text=בדרך (1)");
await shot(wh, "s3-02-in-transit");
await row(1044).locator("summary:has-text('חזר בלי מסירה')").click();
await row(1044).locator("input[name=notes]").fill("הלקוח לא ענה");
await row(1044).locator("button:has-text('החזרה למוכנות')").click();
await wh.waitForSelector("text=בדרך (0)");
await row(1044).locator("button:has-text('יצא לאספקה')").click();
await wh.waitForSelector("text=בדרך (1)");
await row(1044).locator("input[name=receiver]").fill("שירה מהקבלה");
await row(1044).locator("button:has-text('נמסר ללקוח')").click();
await wh.waitForSelector("text=נמסרו ביומיים האחרונים (1)");
// pick-up
await row(1048).locator("input[name=receiver]").fill("דני");
await row(1048).locator("button:has-text('נאסף ע״י הלקוח')").click();
await wh.waitForSelector("text=נמסרו ביומיים האחרונים (2)");
await shot(wh, "s3-03-delivered");
check(sql("select status from orders where id = 1044") === "delivered", "1044 not delivered");
check(sql("select receiver_name from deliveries where order_id = 1048") === "דני", "1048 receiver missing");
const hist = await visit(wh, "/orders/1044", "warehouse", "שובץ שליח");
check(hist.includes("קיבל: שירה מהקבלה") && hist.includes("הלקוח לא ענה"), "order history lacks receiver or return reason");
await shot(wh, "s3-04-order-delivered");
const note = await visit(wh, "/print/orders/1044?doc=delivery", "warehouse", "תעודת משלוח");
check(note.includes("חתימה") && !note.includes("₪"), "delivery note has prices or lacks signature");
await shot(wh, "s3-05-delivery-note");
const mob = await session("u6@test.local", 390);
await visit(mob, "/deliveries", "warehouse-mobile", "משלוחים"); await shot(mob, "s3-06-deliveries-mobile");
await visit(wh, "/reports", "warehouse"); check(!wh.url().includes("/reports"), "warehouse reached reports");

// ---- worker and marketer may not deliver
const wk = await session("u5@test.local");
await gotoGuarded(wk, BASE + "/deliveries"); check(!wk.url().includes("/deliveries"), "worker reached deliveries");

// ---- admin: price list, customer on the list, import
const a = await session("u1@test.local");
await visit(a, "/settings?tab=prices", "admin", "מחירון חדש");
await a.fill("input[name=name] >> nth=0", "חנויות");
await a.click("button:has-text('הוספה')");
await a.waitForSelector("text=המחירון נוסף");
await a.click("summary:has-text('חנויות')");
const firstPrice = a.locator("input[name^=price_]").first();
const productId = (await firstPrice.getAttribute("name")).slice(6);
await firstPrice.fill("42.5");
await a.click("button:has-text('שמירת מחירים')");
await a.waitForSelector("text=נשמרו 1 מחירים.");
await shot(a, "s3-07-price-list");
const custId = sql("select id from customers where name = 'קפה נחת'");
await visit(a, `/customers/${custId}`, "admin", "מחירון");
await a.selectOption("select[name=price_list_id]", { label: "חנויות" });
await a.click("button:has-text('שמירה') >> nth=0");
await a.waitForSelector("text=נשמר.");
check(sql(`select l.name from customers c join price_lists l on l.id = c.price_list_id where c.id = '${custId}'`) === "חנויות", "price list not saved on customer");

// import: csv (customers, prices), xlsx (products, materials)
mkdirSync(".e2e/import", { recursive: true });
writeFileSync(".e2e/import/customers.csv", "﻿שם,טלפון,סוג,כתובת,עיר,מחירון\r\nמאפיית השכונה,052-3334444,עסקי,הנביאים 3,חיפה,חנויות\r\nמשפחת לוי,0541112222,פרטי,,,\r\n");
execFileSync("python3", ["-c", `
import openpyxl
wb = openpyxl.Workbook(); ws = wb.active
ws.append(["מוצר", "קטגוריה", "מחיר לפני מע״מ", "דקות"])
ws.append(["עוגיית חמאה", "עוגיות", 5.5, 1])
ws.append(["טבלת שוקולד לבן", "טבלאות", 18, 2])
wb.save(".e2e/import/products.xlsx")
wb = openpyxl.Workbook(); ws = wb.active
ws.append(["חומר גלם", "יחידת מידה", "מלאי", "מינימום", "ספק"])
ws.append(["חמאה אירית", "ק״ג", 8, 2, "תנובה"])
wb.save(".e2e/import/materials.xlsx")
`]);
writeFileSync(".e2e/import/bad.csv", "﻿שם,טלפון\r\nבלי טלפון,\r\n");
await visit(a, "/settings?tab=import", "admin", "ייבוא נתונים מאקסל");
const upload = async (kind, file, expectOk) => {
  await a.selectOption("select >> nth=0", kind);
  await a.setInputFiles("#import-file", `.e2e/import/${file}`);
  if (!expectOk) return;
  await a.click(`button:has-text('ייבוא ')`);
  await a.waitForSelector(`text=${expectOk}`);
};
await upload("customers", "bad.csv");
await a.waitForSelector("text=שורה 2: חסר טלפון");
check(!(await a.locator("button:has-text('ייבוא ')").count()), "import button shown for a bad file");
await shot(a, "s3-08-import-error");
await upload("products", "products.xlsx", "יובא: 2 חדשים, 0 עודכנו.");
await shot(a, "s3-09-import-products");
await upload("materials", "materials.xlsx", "יובא: 1 חדשים, 0 עודכנו.");
await upload("customers", "customers.csv", "יובא: 2 חדשים, 0 עודכנו.");
check(sql("select stock_quantity from raw_materials where name = 'חמאה אירית'") === "8.000", "imported opening stock wrong");
check(sql("select l.name from customers c join price_lists l on l.id = c.price_list_id where c.phone = '052-3334444'") === "חנויות", "imported customer lacks price list");
await visit(a, "/settings?tab=products", "admin", "עוגיית חמאה");

// ---- marketer: the new order takes the price list price
const mk = await session("u2@test.local");
await visit(mk, `/orders/new?customer=${custId}`, "marketer", "מחירון חנויות");
const lineSelect = mk.locator("select").filter({ has: mk.locator("option", { hasText: "בחרו מוצר…" }) }).first();
await lineSelect.selectOption(productId);
check((await mk.locator("input[step='0.01']").first().getAttribute("placeholder")) === "42.5", "order form does not show the list price");
await shot(mk, "s3-10-order-price-list");
await mk.click("button:has-text('יצירת הזמנה')");
await mk.waitForURL(/orders\/\d+\?created=1/);
const newId = new URL(mk.url()).pathname.split("/").pop();
check(sql(`select unit_price from order_items where order_id = ${newId}`) === "42.50", "order line did not use the list price");

// ---- reports
await visit(a, "/reports", "admin", "מכירות לפי שבוע"); await shot(a, "s3-11-reports-admin");
for (const r of ["week", "prev", "quarter"]) await visit(a, `/reports?range=${r}`, "admin", "מוצרים מובילים");
const rep = await visit(mk, "/reports", "marketer", "ההזמנות שלך");
check(!rep.includes("לפי משווק"), "marketer sees the per-marketer table");
await shot(mk, "s3-12-reports-marketer");
await visit(a, "/", "admin", "מבט על");

await browser.close();
if (problems.length) { console.log("PROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log("NO PROBLEMS");
