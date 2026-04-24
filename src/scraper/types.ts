export type Marketplace = "EBAY-US" | "EBAY-UK";

export interface SearchSlice {
  id: string;          // e.g. "2023-04-EBAY-US"
  marketplace: Marketplace;
  month: string;       // "YYYY-MM"
  dateFrom: string;    // ISO-8601 start (inclusive)
  dateTo: string;      // ISO-8601 end (exclusive)
}

export interface MobileListingRow {
  itemId: string;
  marketplace: Marketplace;
  itemTitle: string | null;
  imageUrl: string | null;
  avgSoldPrice: number | null;
  avgSoldCurrency: string | null;
  avgShipping: number | null;
  avgShippingCurrency: string | null;
  lastSoldDatetime: string | null;
  endDate: string | null;
  itemOnHold: boolean | null;
  sliceId: string;
}

export interface WebFormatRow {
  itemId: string;
  marketplace: Marketplace;
  listingFormat: string | null;
  bids: number | null;
}

// Shape read back from the `sold_listings` view — the 9 target fields + keys.
export interface JoinedListingRecord {
  itemId: string;
  marketplace: Marketplace;
  itemTitle: string | null;
  listingFormat: string | null;
  soldPrice: number | null;
  soldDate: string | null;
  soldTime: string | null;
  bids: number | null;
  imageUrl: string | null;
  shippingPrice: number | null;
}
