import type { PublicJobSearchFilters } from "./schemas";

export function buildPublicJobSearchHref(
  filters: PublicJobSearchFilters,
  page: number,
  pathname: "" | "/jobs",
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.district) params.set("district", filters.district);
  if (filters.jobType) params.set("jobType", filters.jobType);
  if (filters.workplaceMode) params.set("workplaceMode", filters.workplaceMode);
  params.set("page", String(page));
  return `${pathname}?${params.toString()}`;
}
