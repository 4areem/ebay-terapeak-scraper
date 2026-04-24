import type { AccountConfig } from "../config.js";
import type { SearchSlice } from "../scraper/types.js";
import type { Store } from "../storage/db.js";
import { launchForAccount } from "../browser/context.js";
import { scrapeSlice } from "../scraper/terapeak.js";
import { logger } from "../util/logger.js";
import { jitter } from "../util/jitter.js";

export async function runAccountWorker(
  account: AccountConfig,
  slices: SearchSlice[],
  store: Store,
  headed: boolean,
): Promise<void> {
  const log = logger.child({ account: account.label });
  const { browser, context } = await launchForAccount(account, headed);
  const page = await context.newPage();

  try {
    for (const slice of slices) {
      log.info({ sliceId: slice.id }, "starting slice");
      try {
        for await (const { page: pageNum, records } of scrapeSlice(page, slice)) {
          if (store.isPageDone(slice.id, pageNum)) continue;
          store.insertRecords(slice.id, records);
          store.markProgress(slice.id, pageNum, "done", records.length, null);
          log.info({ sliceId: slice.id, pageNum, count: records.length }, "page done");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error({ sliceId: slice.id, err: msg }, "slice failed");
        store.markProgress(slice.id, 0, "error", null, msg);
      }
      await jitter(5000, 15000);
    }
  } finally {
    await context.close();
    await browser.close();
  }
}
