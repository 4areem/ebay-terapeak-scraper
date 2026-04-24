import type { AccountConfig } from "../config.js";
import type { SearchSlice } from "../scraper/types.js";
import type { Store } from "../storage/db.js";
import { runAccountWorker } from "./worker.js";
import { sleep } from "../util/jitter.js";
import { logger } from "../util/logger.js";

export async function runParallel(
  accounts: AccountConfig[],
  slices: SearchSlice[],
  store: Store,
  headed: boolean,
): Promise<void> {
  const buckets = distribute(slices, accounts.length);

  const tasks = accounts.map(async (account, i) => {
    const stagger = i * (5000 + Math.random() * 10_000);
    logger.info({ account: account.label, staggerMs: Math.round(stagger) }, "staggered start");
    await sleep(stagger);
    await runAccountWorker(account, buckets[i] ?? [], store, headed);
  });

  await Promise.all(tasks);
}

function distribute<T>(items: T[], n: number): T[][] {
  const buckets: T[][] = Array.from({ length: n }, () => []);
  items.forEach((item, i) => buckets[i % n]!.push(item));
  return buckets;
}
