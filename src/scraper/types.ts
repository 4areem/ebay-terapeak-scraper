export interface SoldListingRecord {
  itemId: string;
  itemTitle: string;
  listingFormat: string | null;
  soldPrice: number | null;
  soldDate: string | null;
  soldTime: string | null;
  bids: number | null;
  imageUrl: string | null;
  shippingPrice: number | null;
}

export interface SearchSlice {
  id: string;
  categoryId?: string;
  keyword?: string;
  dateFrom: string;
  dateTo: string;
}
