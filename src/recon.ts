import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { launchForAccount } from "./browser/context.js";
import { logger } from "./util/logger.js";
import { sleep } from "./util/jitter.js";

const TERAPEAK_URL = "https://www.ebay.com/sh/research";

interface NetworkEvent {
  ts: string;
  phase: "request" | "response";
  method?: string;
  url: string;
  resourceType?: string;
  status?: number;
  contentType?: string | null;
  bodyPath?: string;
}

async function main() {
  const label = process.argv[2];
  if (!label) {
    console.error("Usage: npm run recon -- <account_label>");
    process.exit(1);
  }

  const cfg = loadConfig();
  const account = cfg.accounts.find((a) => a.label === label);
  if (!account) {
    console.error(`No account '${label}' in config/accounts.json`);
    process.exit(1);
  }

  const reconDir = resolve("recon");
  const bodiesDir = resolve("recon/bodies");
  mkdirSync(bodiesDir, { recursive: true });
  const networkLog = resolve(reconDir, "network.jsonl");
  writeFileSync(networkLog, "");

  logger.info({ label }, "launching headed browser with saved session");
  const { browser, context } = await launchForAccount(account, true);
  const page = await context.newPage();

  let bodyCounter = 0;
  const interesting = (url: string, ct: string | null): boolean => {
    const isJson = ct?.includes("application/json") ?? false;
    const looksLikeApi =
      /\/(api|research|product|sh)\//.test(url) || /graphql|xhr|json/i.test(url);
    const isThirdPartyNoise = /googletagmanager|doubleclick|krxd|adsafeprotected|facebook/.test(
      url,
    );
    return (isJson || looksLikeApi) && !isThirdPartyNoise;
  };

  const attachListeners = (p: import("rebrowser-playwright").Page) => {
    p.on("request", (req) => {
      const ev: NetworkEvent = {
        ts: new Date().toISOString(),
        phase: "request",
        method: req.method(),
        url: req.url(),
        resourceType: req.resourceType(),
      };
      appendFileSync(networkLog, JSON.stringify(ev) + "\n");
    });

    p.on("response", async (res) => {
      const url = res.url();
      const contentType = res.headers()["content-type"] ?? null;
      const ev: NetworkEvent = {
        ts: new Date().toISOString(),
        phase: "response",
        url,
        status: res.status(),
        contentType,
      };

      if (interesting(url, contentType)) {
        try {
          const body = await res.body();
          const path = resolve(bodiesDir, `${String(bodyCounter).padStart(5, "0")}.bin`);
          writeFileSync(path, body);
          ev.bodyPath = path;
          bodyCounter += 1;
        } catch {
          // body may be unavailable for redirects etc
        }
      }

      appendFileSync(networkLog, JSON.stringify(ev) + "\n");
    });
  };

  attachListeners(page);
  context.on("page", (newPage) => {
    logger.info({ url: newPage.url() }, "new tab opened — attaching listeners");
    attachListeners(newPage);
  });

  logger.info("navigating to Terapeak");
  await page.goto(TERAPEAK_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

  logger.info("waiting 15s for search UI to settle — watch the window");
  await sleep(15_000);

  // Run a default search — if the UI requires manual input, user can drive it instead.
  console.log("\n=== RECON ===");
  console.log("The Terapeak page should be open.");
  console.log("If a default search didn't run, enter any keyword (e.g. 'iphone') in the UI,");
  console.log("set the date range, and trigger the search. Wait for results to fully render.");
  console.log("Press ENTER when the results table is visible to capture artifacts.");

  await waitForEnter();

  const html = await page.content();
  writeFileSync(resolve(reconDir, "page.html"), html);

  await page.screenshot({ path: resolve(reconDir, "page.png"), fullPage: true });

  try {
    const a11y = await page.accessibility.snapshot({ interestingOnly: false });
    writeFileSync(resolve(reconDir, "a11y.json"), JSON.stringify(a11y, null, 2));
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "a11y snapshot failed");
  }

  const url = page.url();
  writeFileSync(resolve(reconDir, "final-url.txt"), url);

  logger.info({ reconDir }, "artifacts saved — close the window or press ENTER again to exit");
  await waitForEnter();

  await context.close();
  await browser.close();
}

function waitForEnter(): Promise<void> {
  return new Promise((resolveP) => {
    process.stdin.setEncoding("utf-8");
    process.stdin.once("data", () => resolveP());
  });
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "recon fatal");
  process.exit(1);
});
