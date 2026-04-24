import { chromium } from "rebrowser-playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { logger } from "./util/logger.js";

const TERAPEAK_URL = "https://www.ebay.com/sh/research";
const SIGNIN_URL = "https://signin.ebay.com/signin";

async function main() {
  const label = process.argv[2];
  if (!label) {
    console.error("Usage: npm run login -- <account_label>");
    process.exit(1);
  }

  const cfg = loadConfig();
  const account = cfg.accounts.find((a) => a.label === label);
  if (!account) {
    console.error(
      `No account '${label}' in config/accounts.json. Known: ${cfg.accounts.map((a) => a.label).join(", ")}`,
    );
    process.exit(1);
  }

  const outPath = resolve(account.cookiePath);
  mkdirSync(dirname(outPath), { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    ...(account.proxy
      ? {
          proxy: {
            server: account.proxy.server,
            ...(account.proxy.username ? { username: account.proxy.username } : {}),
            ...(account.proxy.password ? { password: account.proxy.password } : {}),
          },
        }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  const page = await context.newPage();

  logger.info({ label, outPath }, "opening eBay sign-in — complete login manually (2FA ok)");
  await page.goto(SIGNIN_URL);

  console.log("\n=== LOGIN FLOW ===");
  console.log(`Account:    ${label}`);
  console.log(`Output:     ${outPath}`);
  console.log("");
  console.log("1. Sign in to eBay in the opened window (handle 2FA).");
  console.log(`2. Navigate to ${TERAPEAK_URL} and confirm the page loads.`);
  console.log("3. Come back here and press ENTER to save session + close.");
  console.log("   (Closing the window without pressing ENTER will not save.)");
  console.log("");

  await waitForEnter();

  await context.storageState({ path: outPath });
  logger.info({ outPath }, "storage state saved");

  await context.close();
  await browser.close();
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf-8");
    process.stdin.once("data", () => resolve());
  });
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "login fatal");
  process.exit(1);
});
