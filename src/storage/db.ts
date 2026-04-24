import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { MobileListingRow, WebFormatRow } from "../scraper/types.js";

export type ScrapeSource = "mobile" | "web";
export type ScrapeStatus = "pending" | "done" | "error";

export class Store {
  private db: Database.Database;
  private mobileUpsert: Database.Statement;
  private webUpsert: Database.Statement;
  private progressStmt: Database.Statement;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    const schema = readFileSync(resolve("src/storage/schema.sql"), "utf-8");
    this.db.exec(schema);

    this.mobileUpsert = this.db.prepare(`
      INSERT INTO mobile_listings
        (item_id, marketplace, item_title, image_url,
         avg_sold_price, avg_sold_currency, avg_shipping, avg_shipping_currency,
         last_sold_datetime, end_date, item_on_hold, slice_id)
      VALUES
        (@itemId, @marketplace, @itemTitle, @imageUrl,
         @avgSoldPrice, @avgSoldCurrency, @avgShipping, @avgShippingCurrency,
         @lastSoldDatetime, @endDate, @itemOnHold, @sliceId)
      ON CONFLICT(item_id, marketplace) DO UPDATE SET
        item_title             = excluded.item_title,
        image_url              = excluded.image_url,
        avg_sold_price         = excluded.avg_sold_price,
        avg_sold_currency      = excluded.avg_sold_currency,
        avg_shipping           = excluded.avg_shipping,
        avg_shipping_currency  = excluded.avg_shipping_currency,
        last_sold_datetime     = excluded.last_sold_datetime,
        end_date               = excluded.end_date,
        item_on_hold           = excluded.item_on_hold,
        slice_id               = excluded.slice_id,
        scraped_at             = datetime('now')
    `);

    this.webUpsert = this.db.prepare(`
      INSERT INTO web_format_lookup
        (item_id, marketplace, listing_format, bids)
      VALUES
        (@itemId, @marketplace, @listingFormat, @bids)
      ON CONFLICT(item_id, marketplace) DO UPDATE SET
        listing_format = excluded.listing_format,
        bids           = excluded.bids,
        scraped_at     = datetime('now')
    `);

    this.progressStmt = this.db.prepare(`
      INSERT INTO scrape_progress (source, slice_id, cursor, status, records_found, error)
      VALUES (@source, @sliceId, @cursor, @status, @recordsFound, @error)
      ON CONFLICT(source, slice_id, cursor) DO UPDATE SET
        status        = excluded.status,
        records_found = excluded.records_found,
        error         = excluded.error,
        updated_at    = datetime('now')
    `);
  }

  insertMobileRows(rows: MobileListingRow[]): void {
    const tx = this.db.transaction((batch: MobileListingRow[]) => {
      for (const r of batch) {
        this.mobileUpsert.run({
          ...r,
          itemOnHold: r.itemOnHold === null ? null : r.itemOnHold ? 1 : 0,
        });
      }
    });
    tx(rows);
  }

  insertWebRows(rows: WebFormatRow[]): void {
    const tx = this.db.transaction((batch: WebFormatRow[]) => {
      for (const r of batch) {
        this.webUpsert.run(r);
      }
    });
    tx(rows);
  }

  markProgress(
    source: ScrapeSource,
    sliceId: string,
    cursor: number,
    status: ScrapeStatus,
    recordsFound: number | null,
    error: string | null,
  ): void {
    this.progressStmt.run({ source, sliceId, cursor, status, recordsFound, error });
  }

  isCursorDone(source: ScrapeSource, sliceId: string, cursor: number): boolean {
    const row = this.db
      .prepare(
        `SELECT status FROM scrape_progress WHERE source = ? AND slice_id = ? AND cursor = ?`,
      )
      .get(source, sliceId, cursor) as { status: string } | undefined;
    return row?.status === "done";
  }

  close(): void {
    this.db.close();
  }
}
