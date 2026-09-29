import { chromium } from "./lib.mjs";
const BASE = "http://localhost:3000", OUT = process.env.OUT ?? "e2e/shots";
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

// worker marks production
const w = await session("u5@test.local");
await visit(w, "/board", "worker", "לוח ייצור"); await shot(w, "s2-01-board-worker");
const first = w.locator("article").first();
const name = await first.locator("h3").textContent();
const remainingBefore = Number(await first.locator("input[name=quantity]").inputValue());
await first.locator("input[name=quantity]").fill("2");
const previewPlus = await first.locator("text=/^\\+2$/").count();
if (!previewPlus) problems.push("worker: allocation preview +2 not shown");
await first.locator("button:has-text('סימון ייצור')").click();
await w.waitForSelector("text=סימונים אחרונים");
await w.waitForTimeout(500);
await shot(w, "s2-02-after-mark");
const card = w.locator("article", { has: w.locator("h3", { hasText: name }) }).first();
const remainingAfter = Number(await card.locator("input[name=quantity]").inputValue());
if (remainingAfter !== remainingBefore - 2) problems.push(`worker: remaining ${remainingBefore} -> ${remainingAfter}, expected -2`);
// undo
await w.click("form button:has-text('ביטול')");
await w.waitForTimeout(1000);
await w.reload();
if (await w.locator("text=סימונים אחרונים").count()) problems.push("worker: undo did not clear recent marks");
const card2 = w.locator("article", { has: w.locator("h3", { hasText: name }) }).first();
if (Number(await card2.locator("input[name=quantity]").inputValue()) !== remainingBefore) problems.push("worker: undo did not restore remaining");
// mark a whole batch
const batch = w.locator("article").nth(1);
const bname = await batch.locator("h3").textContent();
const orderIds = await batch.locator("a[href^='/orders/']").allTextContents();
await batch.locator("button:has-text('סימון ייצור')").click();
await w.waitForSelector("text=סימונים אחרונים");
await w.reload();
if (await w.locator("article h3", { hasText: bname }).count() && (await w.locator("article").nth(1).locator("h3").textContent()) === bname) problems.push("worker: full batch still on board: " + bname);
console.log("fully produced batch", bname, "orders", orderIds.join(" "));
await visit(w, `/orders/${orderIds[0].slice(1)}`, "worker", "יוצר"); await shot(w, "s2-03-order-progress");
await w.goto(BASE + "/inventory"); if (w.url().includes("/inventory")) problems.push("worker reached inventory");

// manager reorders
const m = await session("u4@test.local");
await visit(m, "/board", "manager");
const section = m.locator("section").filter({ has: m.locator("article") }).nth(1);
const titlesBefore = await section.locator("article h3").allTextContents();
if (titlesBefore.length >= 2) {
  await section.locator("article").first().locator("button[aria-label='להוריד']").click();
  await m.waitForTimeout(1200); await m.reload();
  const sec = m.locator("section").filter({ has: m.locator("article") }).nth(1);
  const titlesAfter = await sec.locator("article h3").allTextContents();
  if (titlesAfter[0] !== titlesBefore[1] || titlesAfter[1] !== titlesBefore[0]) problems.push(`manager reorder: ${titlesBefore.slice(0, 2)} -> ${titlesAfter.slice(0, 2)}`);
  await shot(m, "s2-04-board-reordered");
  await sec.locator("button:has-text('חזרה לסדר האוטומטי')").click();
  await m.waitForTimeout(1200); await m.reload();
  const back = await m.locator("section").filter({ has: m.locator("article") }).nth(1).locator("article h3").allTextContents();
  if (back[0] !== titlesBefore[0]) problems.push("manager reset order failed");
} else problems.push("manager: second day has <2 batches, reorder not tested");

// warehouse stock actions
const s = await session("u6@test.local");
await visit(s, "/inventory", "warehouse", "מלאי חומרי גלם"); await shot(s, "s2-05-inventory");
if (!(await s.locator("a[href^='https://wa.me/']").count())) problems.push("warehouse: no supplier WhatsApp link");
const row = s.locator("li:has(details)").last();
await row.locator("summary").click();
await row.locator("input[name=quantity]").fill("10"); await row.locator("input[name=reason]").fill("תעודה 123");
await row.locator("button:has-text('שמירה')").click(); await s.waitForSelector("text=נוספו 10");
await row.locator("label:has-text('פחת')").click();
await row.locator("input[name=quantity]").fill("1.5"); await row.locator("input[name=reason]").fill("נשבר");
await row.locator("button:has-text('שמירה')").click(); await s.waitForSelector("text=ירדו 1.5");
await row.locator("label:has-text('ספירת מלאי')").click();
await row.locator("input[name=quantity]").fill("100");
await row.locator("button:has-text('שמירה')").click(); await s.waitForSelector("text=/(נוספו|ירדו)/");
await shot(s, "s2-06-inventory-actions");
await row.locator("a:has-text('היסטוריית תנועות')").click();
await s.waitForURL(/inventory\//);
const hist = await visit(s, new URL(s.url()).pathname, "warehouse", "תנועות אחרונות");
for (const t of ["קבלת סחורה", "פחת", "ספירה", "תעודה 123", "נשבר"]) if (!hist.includes(t)) problems.push("history missing " + t);
if (!hist.includes("100")) problems.push("history: stock not 100");
await shot(s, "s2-07-history");
await s.goto(BASE + "/board"); if (s.url().includes("/board")) problems.push("warehouse reached board");

// marketer blocked from board; admin home alerts
const mk = await session("u2@test.local");
await mk.goto(BASE + "/board"); if (mk.url().includes("/board")) problems.push("marketer reached board");
const a = await session("u1@test.local");
const home = await visit(a, "/", "admin", "התראות"); await shot(a, "s2-08-home");
if (!home.includes("חוסר")) problems.push("admin home: no shortage alert");
const mob = await session("u5@test.local", 390); await visit(mob, "/board", "worker-mobile"); await shot(mob, "s2-09-board-mobile");
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "NO PROBLEMS");
process.exit(problems.length ? 1 : 0);
