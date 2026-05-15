import { Store } from "../storage/db.js";
import { MobileClient, MobileError } from "./mobile.js";
import type { Marketplace, SearchSlice } from "./types.js";

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildSlice(keyword: string, month: string, marketplace: Marketplace): SearchSlice {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dateFrom = `${month}-01T00:00:00.000Z`;
  const dateTo = `${month}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;
  return {
    id: `${slugify(keyword)}__${month}__${marketplace}`,
    keyword,
    marketplace,
    month,
    dateFrom,
    dateTo,
  };
}

function parseArgs(): { keyword: string; month: string; marketplace: Marketplace } {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback?: string) => {
    const i = args.indexOf(flag);
    if (i >= 0 && args[i + 1]) return args[i + 1];
    return fallback;
  };
  const keyword = get("--keyword", "topps premier league chrome")!;
  const month = get("--month", "2025-06")!;
  const marketplace = (get("--marketplace", "EBAY-US") as Marketplace)!;
  return { keyword, month, marketplace };
}

async function main() {
  const { keyword, month, marketplace } = parseArgs();
  const slice = buildSlice(keyword, month, marketplace);
  const store = new Store("data/scraper.db");
  const client = new MobileClient({ initialLimit: 500 });

  console.log(`slice: ${slice.id}`);
  console.log(`range: ${slice.dateFrom} - ${slice.dateTo}`);
  console.log("");

  let total = 0;
  const t0 = Date.now();

  try {
    for await (const page of client.scrapeSlice(slice)) {
      store.insertMobileRows(page.rows);
      store.markProgress("mobile", slice.id, page.offset, "done", page.rows.length, null);
      total += page.rows.length;
      const summarySuffix = page.summary
        ? ` (summary: sold=${page.summary.soldListingsCount})`
        : "";
      console.log(
        `  offset=${page.offset} limit=${page.limit} got=${page.rows.length}${summarySuffix}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("FAILED:", msg);
    if (err instanceof MobileError && err.graphqlErrors) {
      console.error(JSON.stringify(err.graphqlErrors, null, 2));
    }
    store.markProgress("mobile", slice.id, total, "error", total, msg);
    store.close();
    process.exit(1);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("");
  console.log(`done: ${total} rows in ${elapsed}s`);
  store.close();
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
