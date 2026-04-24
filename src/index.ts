import { loadConfig } from "./config.js";
import { Store } from "./storage/db.js";
import { runParallel } from "./accounts/manager.js";
import { logger } from "./util/logger.js";
import type { SearchSlice } from "./scraper/types.js";

async function main() {
  const cfg = loadConfig();
  const headed = cfg.headed || process.argv.includes("--headed");

  const store = new Store(cfg.dbPath);

  // TODO: Replace with real slice planner. For now, a stub single-slice run for smoke testing.
  // The real planner will subdivide the 3-year window by category + date range to stay under
  // Terapeak's per-query result cap.
  const slices: SearchSlice[] = [
    {
      id: "smoke-test",
      dateFrom: "2025-01-01",
      dateTo: "2025-01-07",
    },
  ];

  logger.info(
    { accounts: cfg.accounts.length, slices: slices.length, headed },
    "starting backfill",
  );

  try {
    await runParallel(cfg.accounts, slices, store, headed);
  } finally {
    store.close();
  }
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "fatal");
  process.exit(1);
});
