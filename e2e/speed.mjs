// Page speed: for each page, how long the server takes to answer and how many Supabase requests it makes.
// Start the stack with E2E_LATENCY_MS=80 ./e2e/up.sh to feel a far-away Supabase region, then run a production build.
import fs from "node:fs";
import { chromium } from "./lib.mjs";
const BASE = "http://localhost:3000";
const LOG = new URL("../.e2e/gateway.log", import.meta.url);
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "he-IL" });
const page = await ctx.newPage();
await page.goto(BASE + "/login");
await page.fill("#email", "u1@test.local"); await page.fill("#password", "pw");
await page.click("button:has-text('כניסה')");
await page.waitForURL(BASE + "/");
const orderId = process.env.ORDER_ID ?? 1043;
const paths = ["/", "/orders", `/orders/${orderId}`, "/board", "/inventory", "/deliveries", "/customers", "/reports", "/settings", "/orders/new"];
const lines = () => fs.readFileSync(LOG, "utf8").split("\n").filter((l) => /(GET|POST|PATCH|PUT|DELETE) /.test(l)).length;
const rows = [];
for (const p of paths) {
  const times = [], calls = [];
  for (let i = 0; i < 3; i++) {
    const before = lines(), t = Date.now();
    const r = await ctx.request.get(BASE + p, { maxRedirects: 0 });
    await r.body();
    times.push(Date.now() - t); calls.push(lines() - before);
    if (r.status() !== 200) throw new Error(`${p} → ${r.status()}`);
  }
  rows.push({ page: p, ms: Math.min(...times), supabaseRequests: Math.min(...calls) });
}
console.table(rows);
await browser.close();
