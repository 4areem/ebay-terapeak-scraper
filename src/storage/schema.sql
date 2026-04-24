CREATE TABLE IF NOT EXISTS sold_listings (
  item_id         TEXT PRIMARY KEY,
  item_title      TEXT NOT NULL,
  listing_format  TEXT,
  sold_price      REAL,
  sold_date       TEXT,
  sold_time       TEXT,
  bids            INTEGER,
  image_url       TEXT,
  shipping_price  REAL,
  slice_id        TEXT NOT NULL,
  scraped_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sold_listings_sold_date ON sold_listings(sold_date);
CREATE INDEX IF NOT EXISTS idx_sold_listings_slice     ON sold_listings(slice_id);

CREATE TABLE IF NOT EXISTS scrape_progress (
  slice_id        TEXT NOT NULL,
  page            INTEGER NOT NULL,
  status          TEXT NOT NULL,
  records_found   INTEGER,
  error           TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slice_id, page)
);
