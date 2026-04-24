import type { Page } from "rebrowser-playwright";
import type { SearchSlice, SoldListingRecord } from "./types.js";
import { extractRecordsFromPage } from "./extract.js";
import { jitter } from "../util/jitter.js";
import { logger } from "../util/logger.js";

const TERAPEAK_URL = "https://www.ebay.com/sh/research";

export async function* scrapeSlice(
  page: Page,
  slice: SearchSlice,
): AsyncGenerator<{ page: number; records: SoldListingRecord[] }> {
  const url = buildSearchUrl(slice);
  logger.info({ sliceId: slice.id, url }, "navigating to slice");
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await jitter(1500, 3500);

  let pageNum = 1;
  while (true) {
    await page.waitForSelector("[data-testid='research-table-row']", { timeout: 30_000 });
    const records = await extractRecordsFromPage(page);
    yield { page: pageNum, records };

    const nextBtn = page.locator("[data-testid='pagination-next']:not([disabled])");
    if ((await nextBtn.count()) === 0) break;

    await nextBtn.first().click();
    await jitter(2000, 5000);
    pageNum += 1;
  }
}

function buildSearchUrl(slice: SearchSlice): string {
  const params = new URLSearchParams({
    marketplace: "EBAY-US",
    dayRange: "custom",
    startDate: slice.dateFrom,
    endDate: slice.dateTo,
    tabName: "SOLD",
  });
  if (slice.categoryId) params.set("categoryId", slice.categoryId);
  if (slice.keyword) params.set("keywords", slice.keyword);
  return `${TERAPEAK_URL}?${params.toString()}`;
}
