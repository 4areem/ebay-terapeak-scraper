-- Mobile GraphQL writes here. One row per listing per marketplace.
-- Fields mirror what TerapeakResearch returns per listing.
CREATE TABLE IF NOT EXISTS mobile_listings (
  item_id              TEXT NOT NULL,
  marketplace          TEXT NOT NULL,
  item_title           TEXT,
  image_url            TEXT,
  avg_sold_price       REAL,
  avg_sold_currency    TEXT,
  avg_shipping         REAL,
  avg_shipping_currency TEXT,
  last_sold_datetime   TEXT,
  end_date             TEXT,
  item_on_hold         INTEGER,
  slice_id             TEXT NOT NULL,
  scraped_at           TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_id, marketplace)
);

CREATE INDEX IF NOT EXISTS idx_mobile_listings_slice         ON mobile_listings(slice_id);
CREATE INDEX IF NOT EXISTS idx_mobile_listings_last_sold     ON mobile_listings(last_sold_datetime);

-- Terapeak web aggregate fill-in. Only stores fields mobile doesn't expose.
CREATE TABLE IF NOT EXISTS web_format_lookup (
  item_id         TEXT NOT NULL,
  marketplace     TEXT NOT NULL,
  listing_format  TEXT,
  bids            INTEGER,
  scraped_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_id, marketplace)
);

-- Per-source, per-slice progress so mobile and web can resume independently.
CREATE TABLE IF NOT EXISTS scrape_progress (
  source          TEXT NOT NULL,           -- 'mobile' | 'web'
  slice_id        TEXT NOT NULL,
  cursor          INTEGER NOT NULL,        -- offset for mobile, page for web
  status          TEXT NOT NULL,           -- 'pending' | 'done' | 'error'
  records_found   INTEGER,
  error           TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source, slice_id, cursor)
);

-- Final joined output. Read this to get the 9-field target records.
CREATE VIEW IF NOT EXISTS sold_listings AS
SELECT
  m.item_id,
  m.marketplace,
  m.item_title,
  w.listing_format,
  m.avg_sold_price   AS sold_price,
  substr(m.last_sold_datetime, 1, 10) AS sold_date,
  substr(m.last_sold_datetime, 12, 8) AS sold_time,
  w.bids,
  m.image_url,
  m.avg_shipping     AS shipping_price,
  m.slice_id,
  m.scraped_at
FROM mobile_listings m
LEFT JOIN web_format_lookup w
  ON m.item_id = w.item_id AND m.marketplace = w.marketplace;
