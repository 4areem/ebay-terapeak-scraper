import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MobileListingRow, SearchSlice } from "./types.js";

const ENDPOINT = "https://apisd.ebay.com/graphql";
const DEFAULT_TOKEN_PATH = resolve("data/token.txt");

// Registered query texts captured from the real eBay Android app.
// Do NOT edit a single character — the gateway rejects anything that doesn't match.
const RESEARCH_QUERY =
  "query TerapeakResearch($terapeakResearchInput: TerapeakResearchInput!, $listingInput: TerapeakListingInput) { terapeakResearch(input: $terapeakResearchInput) { summary { freeShippingPercent sellerCount avgShipping { amount currency } priceRange { maxPrice { amount currency } minPrice { amount currency } } soldPrice { avgPrice { amount currency } percentage priorAvgPrice { amount currency } } unsoldListingsCount soldListingsCount } listingMetrics(input: $listingInput) { __typename ...TerapeakListingsMetricFragment } } }  fragment TerapeakListingsMetricFragment on TerapeakResearchListingMetrics { listings { avgShipping { amount currency } avgSoldPrice { amount currency } lastSoldDateTime listing { id image { id url } price { originalPrice { converted { amount currency } } } title endDate } itemOnHold } nextPageAvailable }";

const LISTINGS_QUERY =
  "query TerapeakListings($input: TerapeakResearchInput!, $listingsInput: TerapeakListingInput!) { terapeakResearch(input: $input) { listingMetrics(input: $listingsInput) { __typename ...TerapeakListingsMetricFragment } } }  fragment TerapeakListingsMetricFragment on TerapeakResearchListingMetrics { listings { avgShipping { amount currency } avgSoldPrice { amount currency } lastSoldDateTime listing { id image { id url } price { originalPrice { converted { amount currency } } } title endDate } itemOnHold } nextPageAvailable }";

export interface MobileFetchOptions {
  tokenPath?: string;
  initialLimit?: number;   // starting page size; halves on error
  minLimit?: number;       // give up if halved below this
}

interface GraphqlListingRaw {
  listing?: {
    id?: string;
    title?: string;
    endDate?: string;
    image?: { url?: string };
  };
  avgSoldPrice?: { amount?: number | string; currency?: string };
  avgShipping?: { amount?: number | string; currency?: string };
  lastSoldDateTime?: string;
  itemOnHold?: boolean;
}

interface PageResult {
  rows: MobileListingRow[];
  nextPageAvailable: boolean;
  summary?: { soldListingsCount: number; unsoldListingsCount: number };
}

export class MobileClient {
  private tokenPath: string;
  private initialLimit: number;
  private minLimit: number;

  constructor(opts: MobileFetchOptions = {}) {
    this.tokenPath = opts.tokenPath ?? DEFAULT_TOKEN_PATH;
    this.initialLimit = opts.initialLimit ?? 500;
    this.minLimit = opts.minLimit ?? 25;
  }

  private readToken(): string {
    const t = readFileSync(this.tokenPath, "utf-8").trim();
    if (!t) throw new Error(`empty token at ${this.tokenPath}`);
    return t;
  }

  async fetchPage(
    slice: SearchSlice,
    offset: number,
    limit: number,
    opName: "TerapeakResearch" | "TerapeakListings",
  ): Promise<PageResult> {
    const researchInput = {
      dateTimeRange: { startDateTime: slice.dateFrom, endDateTime: slice.dateTo },
      excludeItemIds: [],
      title: slice.keyword,
    };
    const pageInput = { pagination: { limit, offset }, sortBy: null };

    const body =
      opName === "TerapeakResearch"
        ? {
            operationName: "TerapeakResearch",
            variables: { terapeakResearchInput: researchInput, listingInput: pageInput },
            query: RESEARCH_QUERY,
          }
        : {
            operationName: "TerapeakListings",
            variables: { input: researchInput, listingsInput: pageInput },
            query: LISTINGS_QUERY,
          };

    const token = this.readToken();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": slice.marketplace,
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      throw new MobileError("unauthorized", { status: 401, retryable: true });
    }

    const text = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new MobileError(`non-json response: ${text.slice(0, 200)}`, {
        status: res.status,
        retryable: false,
      });
    }

    if (parsed.errors) {
      const msg = parsed.errors[0]?.message ?? "unknown graphql error";
      const tooBroad = typeof msg === "string" && msg.includes("too broad");
      throw new MobileError(msg, {
        status: res.status,
        retryable: !tooBroad,
        graphqlErrors: parsed.errors,
      });
    }

    const tr = parsed?.data?.terapeakResearch;
    const lm = tr?.listingMetrics;
    const rawListings: GraphqlListingRaw[] = lm?.listings ?? [];
    const rows = rawListings.map((r) => mapRow(r, slice));

    return {
      rows,
      nextPageAvailable: Boolean(lm?.nextPageAvailable),
      summary: tr?.summary
        ? {
            soldListingsCount: tr.summary.soldListingsCount ?? 0,
            unsoldListingsCount: tr.summary.unsoldListingsCount ?? 0,
          }
        : undefined,
    };
  }

  async *scrapeSlice(
    slice: SearchSlice,
  ): AsyncGenerator<{ rows: MobileListingRow[]; offset: number; limit: number; summary?: PageResult["summary"] }> {
    let offset = 0;
    let limit = this.initialLimit;
    let summary: PageResult["summary"];

    while (true) {
      const opName = offset === 0 ? "TerapeakResearch" : "TerapeakListings";
      let page: PageResult;
      try {
        page = await this.fetchPage(slice, offset, limit, opName);
      } catch (err) {
        if (err instanceof MobileError && err.retryable && limit > this.minLimit) {
          limit = Math.max(this.minLimit, Math.floor(limit / 2));
          continue;
        }
        throw err;
      }

      if (offset === 0 && page.summary) summary = page.summary;
      yield { rows: page.rows, offset, limit, summary };

      if (!page.nextPageAvailable || page.rows.length === 0) return;
      offset += page.rows.length;
    }
  }
}

export class MobileError extends Error {
  status?: number;
  retryable: boolean;
  graphqlErrors?: unknown;
  constructor(
    msg: string,
    info: { status?: number; retryable?: boolean; graphqlErrors?: unknown } = {},
  ) {
    super(msg);
    this.name = "MobileError";
    this.status = info.status;
    this.retryable = info.retryable ?? false;
    this.graphqlErrors = info.graphqlErrors;
  }
}

function mapRow(r: GraphqlListingRaw, slice: SearchSlice): MobileListingRow {
  const id = r.listing?.id ?? "";
  return {
    itemId: id,
    marketplace: slice.marketplace,
    itemTitle: r.listing?.title ?? null,
    imageUrl: r.listing?.image?.url ?? null,
    avgSoldPrice: toNum(r.avgSoldPrice?.amount),
    avgSoldCurrency: r.avgSoldPrice?.currency ?? null,
    avgShipping: toNum(r.avgShipping?.amount),
    avgShippingCurrency: r.avgShipping?.currency ?? null,
    lastSoldDatetime: r.lastSoldDateTime ?? null,
    endDate: r.listing?.endDate ?? null,
    itemOnHold: typeof r.itemOnHold === "boolean" ? r.itemOnHold : null,
    sliceId: slice.id,
  };
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
