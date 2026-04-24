import { loadConfig } from "./config.js";
import { Store } from "./storage/db.js";
import { logger } from "./util/logger.js";

async function main() {
  const cfg = loadConfig();
  const store = new Store(cfg.dbPath);

  logger.info(
    { accounts: cfg.accounts.length, dbPath: cfg.dbPath },
    "store initialized — mobile/web scrapers not yet wired",
  );

  store.close();
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "fatal");
  process.exit(1);
});
