import { chromium } from "./lib.mjs";
const BASE = "http://localhost:3000";
const OUT = process.env.OUT ?? "e2e/shots";
const browser = await chromium.launch();
const problems = [];
async function session(email) {
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${email} pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("hydrated but some attributes") && problems.push(`${email} console ${m.text().slice(0, 200)}`));
  await page.goto(BASE + "/login");
  await page.fill("#email", email);
  await page.fill("#password", "pw");
  await page.click("button:has-text('כניסה')");
  await page.waitForURL(BASE + "/");
  return page;
}
async function visit(page, path, who, expectText) {
  const r = await page.goto(BASE + path);
  const body = await page.textContent("body");
  const bad = r.status() >= 400 || /Application error|Unhandled Runtime Error|Internal Server Error|נכשלה/.test(body);
  if (bad || (expectText && !body.includes(expectText))) problems.push(`${who} ${path} status=${r.status()} missing="${expectText ?? ""}" url=${page.url()} :: ${body.slice(0, 160).replace(/\s+/g, " ")}`);
  return body;
}
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

// ---- admin
const a = await session("u1@test.local");
await visit(a, "/", "admin", "מבט על"); await shot(a, "01-home");
for (const t of ["business", "staff", "products", "materials"]) await visit(a, `/settings?tab=${t}`, "admin");
await shot(a, "02-settings-materials");
await visit(a, "/settings?tab=products", "admin", "מוצר חדש"); await shot(a, "03-settings-products");
await a.click("a:has-text('עריכה')"); await a.waitForURL(/settings\/products\//);
await visit(a, new URL(a.url()).pathname, "admin", "מתכון ליחידה אחת"); await shot(a, "04-product");
// add a recipe line
await a.selectOption("select[name=raw_material_id]", { index: 1 });
await a.fill("input[name=quantity_per_unit]", "0.25");
await a.click("button:has-text('הוספה / עדכון')");
await a.waitForSelector("text=המתכון עודכן");
// add staff and material
await visit(a, "/settings?tab=staff", "admin");
await a.fill("input[name=full_name] >> nth=0", "עובדת בדיקה");
await a.fill("input[name=email] >> nth=0", "Test.Worker@test.local");
await a.check("input[name=roles][value=production_worker] >> nth=0");
await a.click("button:has-text('הוספה')");
await a.waitForSelector("text=העובד נוסף");
await visit(a, "/settings?tab=materials", "admin");
await a.fill("input[name=name] >> nth=0", "סוכר דק");
await a.fill("input[name=unit_of_measure] >> nth=0", "ק״ג");
await a.fill("input[name=minimum_threshold] >> nth=0", "5");
await a.click("button:has-text('הוספה')");
await a.waitForSelector("text=החומר נוסף");
await visit(a, "/settings?tab=business", "admin");
await a.fill("input[name=business_tax_id]", "515151515");
await a.click("button:has-text('שמירה')");
await a.waitForSelector("text=נשמר.");
// customers
await visit(a, "/customers", "admin", "לקוחות"); await shot(a, "05-customers");
await visit(a, "/customers?q=050", "admin");
await visit(a, "/customers/new?next=order", "admin", "לקוח חדש");
await a.fill("input[name=name]", "לקוח בדיקה בע״מ");
await a.fill("input[name=contact_name]", "רותם");
await a.fill("input[name=phone]", "050-1234567");
await a.fill("input[name=address]", "הרצל 10");
await a.fill("input[name=city]", "חיפה");
await a.click("button:has-text('שמירה והמשך להזמנה')");
await a.waitForURL(/orders\/new\?customer=/);
await shot(a, "06-new-order-empty");
// order form
const lineSelects = a.locator("select").filter({ has: a.locator("option", { hasText: "בחרו מוצר…" }) });
await lineSelects.nth(0).selectOption({ index: 1 });
await a.fill("input[type=number] >> nth=0", "3");
await a.click("button:has-text('הוספת מוצר')");
await lineSelects.nth(1).selectOption({ index: 2 });
await a.fill("input[placeholder='מיתוג, הקדשה, צבע סרט'] >> nth=1", "לוגו של הלקוח");
await a.check("input[name=is_urgent]");
await a.fill("textarea[name=notes]", "להתקשר לפני");
await shot(a, "07-new-order-filled");
await a.click("button:has-text('יצירת הזמנה')");
await a.waitForURL(/orders\/\d+\?created=1/);
const orderPath = new URL(a.url()).pathname;
const ob = await visit(a, orderPath + "?created=1", "admin", "ההזמנה נוצרה");
if (!(await a.locator("a[href^='https://wa.me/972501234567']").count())) problems.push("admin: no WhatsApp link");
if (!ob.includes("לוגו של הלקוח")) problems.push("admin: line note missing");
await shot(a, "08-order-created");
const wa = decodeURIComponent((await a.getAttribute("a[href^='https://wa.me/']", "href")).split("text=")[1]);
console.log("WHATSAPP TEXT:\n" + wa);
await visit(a, "/print" + orderPath, "admin", "אישור הזמנה"); await shot(a, "09-print");
// edit + cancel
await visit(a, orderPath, "admin");
await a.click("summary:has-text('שינוי מועד')");
await a.fill("textarea[name=notes]", "להתקשר לפני, שער אחורי");
await a.click("form button:has-text('שמירה')");
await a.waitForSelector("text=ההזמנה עודכנה");
await a.click("summary:has-text('ביטול ההזמנה')");
await a.fill("input[name=reason]", "בדיקת ביטול");
await a.click("form button:has-text('ביטול ההזמנה')");
await a.waitForSelector("text=ההזמנה בוטלה:");
await visit(a, orderPath, "admin", "בדיקת ביטול"); await shot(a, "10-order-cancelled");
for (const v of ["active", "ready", "delivered", "cancelled", "all"]) await visit(a, `/orders?view=${v}`, "admin");
await visit(a, "/orders?view=all&q=בדיקה", "admin", "לקוח בדיקה");
await visit(a, "/orders?view=active", "admin"); await shot(a, "11-orders");
await visit(a, "/orders/1046", "admin", "הזמנה #1046");
await visit(a, "/inventory", "admin", "מלאי חומרי גלם");
await visit(a, "/more", "admin", "תפריט");
// ---- marketer
const m = await session("u2@test.local");
const mo = await visit(m, "/orders?view=all", "marketer");
await visit(m, "/orders/new", "marketer", "הזמנה חדשה");
await visit(m, "/customers", "marketer");
await m.goto(BASE + "/settings"); if (!m.url().endsWith(BASE + "/") && m.url() !== BASE + "/") problems.push("marketer reached settings: " + m.url());
console.log("marketer sees orders:", (mo.match(/#\d{4}/g) || []).join(" "));
// marketer creates an order
await m.goto(BASE + "/orders/new");
await m.locator("select[name=customer_id]").selectOption({ index: 1 });
await m.locator("select").filter({ has: m.locator("option", { hasText: "בחרו מוצר…" }) }).nth(0).selectOption({ index: 1 });
await m.click("button:has-text('יצירת הזמנה')");
await m.waitForURL(/orders\/\d+\?created=1/);
console.log("marketer created", new URL(m.url()).pathname);
// ---- worker
const w = await session("u5@test.local");
const wb = await visit(w, "/orders/1046", "worker", "הזמנה #1046");
if (/₪/.test(wb)) problems.push("worker sees prices on order page");
await w.goto(BASE + "/orders"); if (w.url().includes("/orders")) problems.push("worker reached order list");
await visit(w, "/", "worker", "מבט על");
await w.setViewportSize({ width: 390, height: 844 });
await visit(a, "/", "admin");
await a.setViewportSize({ width: 390, height: 844 }); await visit(a, "/orders/new", "admin"); await shot(a, "12-mobile-new-order");
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "NO PROBLEMS");
process.exit(problems.length ? 1 : 0);
