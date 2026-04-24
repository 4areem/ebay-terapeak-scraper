# eBay Sold-Listing Backfill

A data-engineering pipeline that reconstructs historical eBay sold-listing data by
reverse-engineering eBay's mobile GraphQL API and joining it with the Terapeak web
aggregate. Built to produce a clean, 9-field-per-listing dataset for market research.

> **Status:** work in progress. The hard part — mapping the mobile API and proving a
> reliable extraction pipeline end to end — is done. The remaining work is the web-side
> join, a multi-slice orchestrator, and CSV export (see [TODO](#todo)).

## What it does

eBay exposes far less historical sold-listing data through its public surfaces than the
apps themselves consume. This project treats that as a data-recovery problem:

- **Mapped the mobile app's private GraphQL endpoint** (`apisd.ebay.com/graphql`) by
  observing its own traffic, then reproducing its exact registered queries. This yields
  7 of the 9 target fields (item id, title, sold price/date/time, image, shipping).
- **Identified the API's real constraints** the hard way — it only accepts *byte-exact*
  registered query text, requires a non-empty `title` (date-only slices are rejected as
  "too broad"), and exposes no `format` filter — and designed the pipeline around them
  rather than fighting them.
- **Built a robust extraction client** that paginates a `keyword × month × marketplace`
  slice, halves its page limit and retries on transient errors, and re-reads its auth
  token each request so long runs survive token rotation.
- **Persists to SQLite** with a schema (`mobile_listings`, `web_format_lookup`,
  `scrape_progress`) and a `sold_listings` view that joins the mobile and web sources.

The remaining two fields (`listing_format`, `bids`) come from Terapeak's web aggregate
API, which is the main piece still under construction.

## Results so far

- Single-slice runner pulls **~6,300 listings in ~16 seconds** at `limit=500`, verified
  end to end against live data.
- Pagination, adaptive retry, and DB upserts all working.

## Architecture

```
src/scraper/mobile.ts       GraphQL client — pagination, adaptive limit, retry/backoff
src/scraper/mobile-run.ts   Single-slice CLI runner (keyword × month × marketplace)
src/storage/db.ts + schema  SQLite layer; sold_listings view joins mobile + web sources
src/scraper/web.ts (TODO)   Terapeak web aggregate scraper for listing_format + bids
tools/                      Python helpers used during API mapping
```

The field mapping and the constraints discovered during reverse engineering are
documented inline in the source and summarized under
[Known constraints](#known-constraints).

### Notes on the auth flow

The mobile API authenticates with a bearer token alone, so once a valid token is
captured the extraction client runs as plain HTTP. Tokens rotate roughly every two
hours. Obtaining a token requires observing the app's own authenticated
traffic in an instrumented Android environment; the setup for that is intentionally left
out of this README, and the repository contains no bypass tooling of its own — the
extraction pipeline and data model are the substance of the project.

## Prerequisites

- Node.js + npm, Python 3.10+
- A captured bearer token in `data/token.txt` (see above)

## Running the single-slice extractor

```sh
npx tsx src/scraper/mobile-run.ts \
  --keyword "topps premier league chrome" \
  --month "2025-06" \
  --marketplace "EBAY-US"
```

Reads `data/token.txt`, paginates the slice, writes rows to `data/scraper.db`
(table `mobile_listings`).

## TODO

- [ ] **Web aggregate scraper** (`src/scraper/web.ts`) — Playwright-based, pulls the
      missing `listing_format` + `bids` from the Terapeak web API (NDJSON, cookie-auth,
      Akamai-protected) and writes to `web_format_lookup`.
- [ ] **Slice planner + orchestrator** — generate all `keyword × month × marketplace`
      slices for a 3-year backfill, loop them calling both scrapers, with resume logic
      driven by `scrape_progress`.
- [ ] **Subdivision** for high-volume slices that exceed the API's per-call soft cap
      (split by week/day, dedupe by `item_id`).
- [ ] **CSV export** — stream the `sold_listings` view to a 9-column CSV.
- [ ] *Stretch:* SQLite → Postgres for parallel writers; per-account proxy support.

## Known constraints

- **Registered queries only** — the gateway rejects anything that isn't a byte-exact
  match against a query the real app shipped.
- **`title` is mandatory** — slices are always `keyword × month × marketplace`, never
  date-only.
- **No `format` filter on mobile** — `listing_format` can only come from the web source.
- **Row = listing, not sale** — a listing that sold multiple units reports averaged
  price/shipping.
- **Token must be live** — bearer tokens rotate ~every 2 hours.

## Layout

```
src/          TypeScript pipeline (Node)
tools/        Python helpers
config/       accounts.json etc. (gitignored except .example)
data/         SQLite DB + token (gitignored)
```
