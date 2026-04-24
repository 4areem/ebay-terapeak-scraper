import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENDPOINT = "https://apisd.ebay.com/graphql";
const TOKEN_PATH = resolve("data/token.txt");

// Exact query text registered by the eBay Android app (captured 2026-04-23).
// Do NOT edit — eBay's gateway enforces QUERY_NOT_REGISTERED if the text differs.
const QUERY =
  "query TerapeakResearch($terapeakResearchInput: TerapeakResearchInput!, $listingInput: TerapeakListingInput) { terapeakResearch(input: $terapeakResearchInput) { summary { freeShippingPercent sellerCount avgShipping { amount currency } priceRange { maxPrice { amount currency } minPrice { amount currency } } soldPrice { avgPrice { amount currency } percentage priorAvgPrice { amount currency } } unsoldListingsCount soldListingsCount } listingMetrics(input: $listingInput) { __typename ...TerapeakListingsMetricFragment } } }  fragment TerapeakListingsMetricFragment on TerapeakResearchListingMetrics { listings { avgShipping { amount currency } avgSoldPrice { amount currency } lastSoldDateTime listing { id image { id url } price { originalPrice { converted { amount currency } } } title endDate } itemOnHold } nextPageAvailable }";

async function main() {
  const token = readFileSync(TOKEN_PATH, "utf-8").trim();
  if (!token) throw new Error(`empty token at ${TOKEN_PATH}`);

  const body = {
    operationName: "TerapeakResearch",
    variables: {
      terapeakResearchInput: {
        dateTimeRange: {
          startDateTime: "2025-03-01T00:00:00.000Z",
          endDateTime: "2025-03-31T23:59:59.999Z",
        },
        excludeItemIds: [],
        title: "iphone",
      },
      listingInput: {
        pagination: { limit: 5, offset: 0 },
        sortBy: null,
      },
    },
    query: QUERY,
  };

  console.log(`POST ${ENDPOINT}`);
  console.log(`token: ${token.slice(0, 30)}... (${token.length} chars)`);
  console.log(`query: TerapeakResearch, limit=5, title="iphone", 2025-03`);
  console.log("");

  const t0 = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY-US",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  const elapsed = Date.now() - t0;

  console.log(`HTTP ${res.status} ${res.statusText} (${elapsed}ms)`);
  console.log("");

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.log("raw body (not JSON):");
    console.log(text.slice(0, 2000));
    process.exit(1);
  }

  const p = parsed as {
    data?: {
      terapeakResearch?: {
        summary?: { soldListingsCount?: number; unsoldListingsCount?: number };
        listingMetrics?: {
          listings?: Array<{ listing?: { id?: string; title?: string } }>;
          nextPageAvailable?: boolean;
        };
      };
    };
    errors?: unknown;
  };

  if (p.errors) {
    console.log("errors:");
    console.log(JSON.stringify(p.errors, null, 2));
    process.exit(1);
  }

  const tr = p.data?.terapeakResearch;
  const summary = tr?.summary;
  const listings = tr?.listingMetrics?.listings ?? [];
  console.log(`summary: sold=${summary?.soldListingsCount} unsold=${summary?.unsoldListingsCount}`);
  console.log(`listings returned: ${listings.length}`);
  console.log(`nextPageAvailable: ${tr?.listingMetrics?.nextPageAvailable}`);
  console.log("");
  console.log("first 3 listings:");
  for (const l of listings.slice(0, 3)) {
    console.log(`  ${l.listing?.id} - ${l.listing?.title?.slice(0, 70)}`);
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
