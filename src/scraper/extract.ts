import type { Page } from "rebrowser-playwright";
import type { SoldListingRecord } from "./types.js";

// NOTE: Terapeak DOM selectors are not yet verified against the live UI.
// This is a scaffold — selectors must be refined once we have a live session.
export async function extractRecordsFromPage(page: Page): Promise<SoldListingRecord[]> {
  return page.$$eval("[data-testid='research-table-row']", (rows) => {
    const parsePrice = (s: string | null): number | null => {
      if (!s) return null;
      const m = s.replace(/[^0-9.]/g, "");
      return m ? Number(m) : null;
    };

    return rows.map((row): SoldListingRecord => {
      const get = (sel: string) =>
        (row.querySelector(sel) as HTMLElement | null)?.innerText?.trim() ?? null;
      const attr = (sel: string, a: string) =>
        (row.querySelector(sel) as HTMLElement | null)?.getAttribute(a) ?? null;

      return {
        itemId: attr("[data-item-id]", "data-item-id") ?? "",
        itemTitle: get(".item-title") ?? "",
        listingFormat: get(".listing-format"),
        soldPrice: parsePrice(get(".sold-price")),
        soldDate: get(".sold-date"),
        soldTime: get(".sold-time"),
        bids: (() => {
          const raw = get(".bids");
          return raw ? Number(raw.replace(/[^0-9]/g, "")) : null;
        })(),
        imageUrl: attr(".item-image img", "src"),
        shippingPrice: parsePrice(get(".shipping-price")),
      };
    });
  });
}
