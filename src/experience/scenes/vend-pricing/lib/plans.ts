export type ListingDuration = 1 | 7 | 30;

export type Plan = {
  id: string;
  name: string;
  audience: string;
  blurb: string;
  features: string[];
  color: string;
  listingCount: number | null;
  prices: Record<ListingDuration, number> | null;
};

export const PRODUCT = "İşBul KKTC";
export const TOUR_TIER = 1;
