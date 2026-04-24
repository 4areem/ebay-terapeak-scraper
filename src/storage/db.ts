import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { SoldListingRecord } from "../scraper/types.js";

export class Store {
  private db: Database.Database;
  private upsertStmt: Database.Statement;
  private progressStmt: Database.Statement;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    const schema = readFileSync(resolve("src/storage/schema.sql"), "utf-8");
    this.db.exec(schema);

    this.upsertStmt = this.db.prepare(`
      INSERT INTO sold_listings
        (item_id, item_title, listing_format, sold_price, sold_date, sold_time,
         bids, image_url, shipping_price, slice_id)
      VALUES
        (@itemId, @itemTitle, @listingFormat, @soldPrice, @soldDate, @soldTime,
         @bids, @imageUrl, @shippingPrice, @sliceId)
      ON CONFLICT(item_id) DO UPDATE SET
        item_title     = excluded.item_title,
        listing_format = excluded.listing_format,
        sold_price     = excluded.sold_price,
        sold_date      = excluded.sold_date,
        sold_time      = excluded.sold_time,
        bids           = excluded.bids,
        image_url      = excluded.image_url,
        shipping_price = excluded.shipping_price,
        scraped_at     = datetime('now')
    `);

    this.progressStmt = this.db.prepare(`
      INSERT INTO scrape_progress (slice_id, page, status, records_found, error)
      VALUES (@sliceId, @page, @status, @recordsFound, @error)
      ON CONFLICT(slice_id, page) DO UPDATE SET
        status        = excluded.status,
        records_found = excluded.records_found,
        error         = excluded.error,
        updated_at    = datetime('now')
    `);
  }

  insertRecords(sliceId: string, records: SoldListingRecord[]): void {
    const tx = this.db.transaction((rows: SoldListingRecord[]) => {
      for (const r of rows) {
        this.upsertStmt.run({ ...r, sliceId });
      }
    });
    tx(records);
  }

  markProgress(
    sliceId: string,
    page: number,
    status: "pending" | "done" | "error",
    recordsFound: number | null,
    error: string | null,
  ): void {
    this.progressStmt.run({ sliceId, page, status, recordsFound, error });
  }

  isPageDone(sliceId: string, page: number): boolean {
    const row = this.db
      .prepare(`SELECT status FROM scrape_progress WHERE slice_id = ? AND page = ?`)
      .get(sliceId, page) as { status: string } | undefined;
    return row?.status === "done";
  }

  close(): void {
    this.db.close();
  }
}
