// Staff logins from the app: initial password, first-login password change, blocking and reset.
import { chromium } from "./lib.mjs";
const BASE = "http://localhost:3000", OUT = process.env.OUT ?? "e2e/shots";
const browser = await chromium.launch();
const problems = [];
const check = (ok, msg) => ok || problems.push(msg);
async function open(email, password) {
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${email} pageerror ${e.message}`));
  await page.goto(BASE + "/login");
  await page.fill("#email", email); await page.fill("#password", password);
  await page.click("button:has-text('כניסה')");
  return page;
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

const a = await open("u1@test.local", "pw"); await a.waitForURL(BASE + "/");
await a.goto(BASE + "/settings?tab=staff");
// adding someone before there is an initial password says so
await a.fill("input[name=full_name] >> nth=0", "נועה בדיקה");
await a.fill("input[name=email] >> nth=0", "noa@test.local");
await a.check("input[name=roles][value=production_worker] >> nth=0");
await a.click("button:has-text('הוספה')");
await a.waitForSelector("text=קודם שומרים סיסמה ראשונית");
await a.fill("input[name=initial_password]", "start1");
await a.click("form:has(input[name=initial_password]) button");
await a.waitForSelector("text=הסיסמה הראשונית נשמרה.");
await a.reload();
const row = a.locator("li", { hasText: "noa@test.local" });
await row.locator("summary").click();
await row.locator("button:has-text('יצירת כניסה')").click();
await a.waitForSelector("text=הסיסמה אופסה");
// a second worker added after the password exists gets a login straight away
await a.fill("input[name=full_name] >> nth=0", "דן בדיקה");
await a.fill("input[name=email] >> nth=0", "dan@test.local");
await a.check("input[name=roles][value=warehouse] >> nth=0");
await a.click("button:has-text('הוספה')");
await a.waitForSelector("text=נכנס עם האימייל והסיסמה הראשונית");
await a.reload(); await shot(a, "s5-01-staff");
check(await a.locator("li", { hasText: "dan@test.local" }).locator("text=עוד לא בחר סיסמה").count(), "dan not marked as needing a password");

// first login: forced to choose a password
const n = await open("noa@test.local", "start1"); await n.waitForURL(BASE + "/");
await n.waitForSelector("text=בוחרים סיסמה"); await shot(n, "s5-02-choose-password");
check(!(await n.locator("nav").count()), "app menu shown before the password is changed");
await n.fill("input[name=password]", "noa-own-1"); await n.fill("input[name=confirm]", "noa-own-2");
await n.click("button:has-text('שמירת הסיסמה')"); await n.waitForSelector("text=שתי הסיסמאות לא זהות.");
await n.fill("input[name=password]", "noa-own-1"); await n.fill("input[name=confirm]", "noa-own-1");
await n.click("button:has-text('שמירת הסיסמה')"); await n.waitForSelector("text=לוח ייצור");
const again = await open("noa@test.local", "noa-own-1"); await again.waitForURL(BASE + "/");
check(!(await again.locator("text=בוחרים סיסמה").count()), "asked to choose a password again");
const old = await open("noa@test.local", "start1"); await old.waitForSelector("text=האימייל או הסיסמה שגויים.");

// block, then the login fails; unblock and reset, then the initial password works again
await a.reload();
const r2 = a.locator("li", { hasText: "noa@test.local" });
await r2.locator("summary").click();
await r2.locator("input[name=is_active]").uncheck();
await r2.locator("button:has-text('שמירה')").click(); await a.waitForSelector("text=העובד עודכן.");
const blocked = await open("noa@test.local", "noa-own-1"); await blocked.waitForSelector("text=/שגויים|נחסמה/");
await a.reload();
const r3 = a.locator("li", { hasText: "noa@test.local" });
check(await r3.locator("text=חסום").count(), "blocked worker not marked");
await r3.locator("summary").click();
await r3.locator("input[name=is_active]").check();
await r3.locator("button:has-text('שמירה')").click(); await a.waitForSelector("text=העובד עודכן.");
await r3.locator("button:has-text('איפוס סיסמה')").click(); await a.waitForSelector("text=הסיסמה אופסה");
const reset = await open("noa@test.local", "start1"); await reset.waitForURL(BASE + "/");
await reset.waitForSelector("text=בוחרים סיסמה");
// the admin has no reset button on their own row
await a.reload();
const me = a.locator("li", { hasText: "u1@test.local" });
await me.locator("summary").click();
check(!(await me.locator("button:has-text('איפוס סיסמה')").count()), "admin can reset their own password");

await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "NO PROBLEMS");
process.exit(problems.length ? 1 : 0);
