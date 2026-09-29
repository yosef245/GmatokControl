// Screenshots for the user guide, on a fresh stack (./e2e/up.sh) and a production server (next build && next start)
// started with the WHATSAPP_* variables from e2e/up.sh. Saves to e2e/shots/guide.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "./lib.mjs";
const BASE = "http://localhost:3000", OUT = "e2e/shots/guide";
mkdirSync(OUT, { recursive: true });
const DB = `postgresql://postgres@localhost:54330/postgres?host=${process.cwd()}/.e2e/pg`;
const sql = (q) => execFileSync("psql", [DB, "-qAtc", q], { encoding: "utf8" }).trim();
const browser = await chromium.launch();
async function session(email, w = 1280, h = 800) {
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login");
  await page.fill("#email", email); await page.fill("#password", "pw");
  await page.click("button:has-text('כניסה')"); await page.waitForURL(BASE + "/");
  return page;
}
const go = async (p, path) => { await p.goto(BASE + path); await p.waitForLoadState("networkidle"); };
const shot = (p, n, full = false) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: full });
const el = (loc, n) => loc.screenshot({ path: `${OUT}/${n}.png` });

// login
{
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage(); await go(p, "/login"); await shot(p, "01-login");
}
// home
const a = await session("u1@test.local");
await shot(a, "02-home-admin", true);
const mob = await session("u2@test.local", 390, 844);
await shot(mob, "03-home-mobile");

// marketer: customers, new customer, new order, order page, list, print
const m = await session("u2@test.local");
await go(m, "/customers"); await shot(m, "04-customers");
await go(m, "/customers/new?next=order");
await m.fill("input[name=name]", "קונדיטוריית הגפן");
await m.fill("input[name=contact_name]", "נועה");
await m.fill("input[name=phone]", "052-5550101");
await m.selectOption("select[name=type]", "business");
await m.fill("input[name=address]", "הגפן 12");
await m.fill("input[name=city]", "חיפה");
await m.fill("input[name=delivery_notes]", "כניסה מהחצר");
await shot(m, "05-new-customer");
await m.click("button:has-text('שמירה והמשך להזמנה')");
await m.waitForURL(/orders\/new\?customer=/);
const lines = m.locator("select").filter({ has: m.locator("option", { hasText: "בחרו מוצר…" }) });
await lines.nth(0).selectOption({ index: 1 });
await m.locator("input[type=number]").first().fill("20");
await m.click("button:has-text('הוספת מוצר')");
await lines.nth(1).selectOption({ index: 4 });
await m.fill("input[placeholder='מיתוג, הקדשה, צבע סרט'] >> nth=1", "סרט זהב");
await m.fill("textarea[name=notes]", "להתקשר חצי שעה לפני");
await shot(m, "06-new-order", true);
await m.click("button:has-text('יצירת הזמנה')");
await m.waitForURL(/orders\/\d+\?created=1/);
const newOrder = new URL(m.url()).pathname.split("/").pop();
await m.waitForLoadState("networkidle");
await shot(m, "07-order-created", true);
await go(m, "/orders"); await shot(m, "08-orders");
await go(m, `/print/orders/${newOrder}`); await shot(m, "09-print", true);

// production board
const w = await session("u5@test.local");
await go(w, "/board"); await shot(w, "10-board");
const first = w.locator("article").first();
await first.locator("input[name=quantity]").fill("5");
await el(first, "11-batch-preview");
await first.locator("button:has-text('סימון ייצור')").click();
await w.waitForSelector("text=סימונים אחרונים");
await w.waitForTimeout(500);
await shot(w, "12-board-marked");
const pm = await session("u4@test.local");
await go(pm, "/board");
await el(pm.locator("section").filter({ has: pm.locator("article") }).nth(1), "13-board-manager-day");
const wmob = await session("u5@test.local", 390, 844);
await go(wmob, "/board"); await shot(wmob, "14-board-mobile");

// stock
const s = await session("u6@test.local");
await go(s, "/inventory"); await shot(s, "15-inventory", true);
const row = s.locator("li:has(details)").last();
await row.locator("summary").click();
await row.locator("input[name=quantity]").fill("10"); await row.locator("input[name=reason]").fill("תעודת משלוח 4411");
await el(row, "16-stock-form");
await row.locator("button:has-text('שמירה')").click(); await s.waitForSelector("text=נוספו 10");
await row.locator("a:has-text('היסטוריית תנועות')").click(); await s.waitForURL(/inventory\//);
await s.waitForLoadState("networkidle"); await shot(s, "17-stock-history");

// deliveries
sql(`update order_items set produced_quantity = quantity where order_id in (1044, 1048);
     update orders set status = 'ready_for_delivery' where id in (1044, 1048);
     update orders set address_id = null where id = 1048;`);
await go(s, "/deliveries"); await shot(s, "18-deliveries", true);
const r = (id) => s.locator("li", { has: s.locator(`a[href='/orders/${id}']`) });
await r(1044).locator("input[name=courier_name]").fill("גט טקסי");
await r(1044).locator("button:has-text('שיבוץ')").click(); await s.waitForSelector("text=השליח שובץ.");
await r(1044).locator("button:has-text('יצא לאספקה')").click(); await s.waitForSelector("text=בדרך (1)");
await s.waitForTimeout(300);
await el(r(1044), "19-in-transit");
await go(s, "/print/orders/1044?doc=delivery"); await shot(s, "20-delivery-note", true);

// reports
await go(a, "/reports"); await shot(a, "21-reports", true);

// settings
await go(a, "/settings?tab=business"); await shot(a, "22-settings-business");
await go(a, "/settings?tab=staff"); await shot(a, "23-settings-staff");
await go(a, "/settings?tab=products");
await a.click("a:has-text('עריכה')"); await a.waitForURL(/settings\/products\//); await a.waitForLoadState("networkidle");
await shot(a, "24-product-recipe", true);
await go(a, "/settings?tab=materials"); await shot(a, "25-settings-materials");
await go(a, "/settings?tab=prices");
await a.fill("input[name=name] >> nth=0", "חנויות"); await a.click("button:has-text('הוספה')"); await a.waitForSelector("text=המחירון נוסף");
await a.click("summary:has-text('חנויות')");
await a.locator("input[name^=price_]").nth(0).fill("48"); await a.locator("input[name^=price_]").nth(1).fill("48");
await a.click("button:has-text('שמירת מחירים')"); await a.waitForSelector("text=נשמרו 2 מחירים.");
await shot(a, "26-price-list");
mkdirSync(".e2e/import", { recursive: true });
writeFileSync(".e2e/import/customers-guide.csv", "﻿שם,טלפון,איש קשר,סוג,כתובת,עיר,מחירון\r\nמאפיית השכונה,052-3334444,אבי,עסקי,הנביאים 3,חיפה,חנויות\r\nמשפחת לוי,054-1112222,,פרטי,הורדים 8,נשר,\r\nבית קפה ים,04-8556677,דנה,עסקי,,,\r\n");
await go(a, "/settings?tab=import");
await a.setInputFiles("#import-file", ".e2e/import/customers-guide.csv");
await a.waitForSelector("button:has-text('ייבוא ')");
await shot(a, "27-import", true);
await go(a, "/settings?tab=whatsapp"); await shot(a, "28-whatsapp", true);

await browser.close();
console.log("shots in", OUT);
