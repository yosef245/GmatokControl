// Playwright is not a project dependency; use the globally installed one (npm i -g playwright).
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require(`${execSync("npm root -g").toString().trim()}/playwright`);
}
export const { chromium } = pw;

/** Opens a page the user may not see. The page sends them home, after the loading screen when navigation streams. */
export async function gotoGuarded(page, url) {
  await page.goto(url);
  await page.waitForURL((u) => u.href !== url, { timeout: 5000 }).catch(() => {});
}
