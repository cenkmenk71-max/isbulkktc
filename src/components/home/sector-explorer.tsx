"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  SectorCard,
  type SectorCardData,
  type SectorCategory,
} from "@/components/home/sector-card";

type SectorExplorerProps = {
  sectors: SectorCardData[];
  categories: { key: SectorCategory; label: string }[];
  labels: {
    title: string;
    description: string;
    searchLabel: string;
    searchPlaceholder: string;
    filterLabel: string;
    allLabel: string;
    totalLabel: string;
    totalCount: string;
    resultCountSingular: string;
    resultCountPlural: string;
    clearSearch: string;
    emptyTitle: string;
    emptyDescription: string;
    clearFilters: string;
  };
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .trim();
}

export function SectorExplorer({
  sectors,
  categories,
  labels,
}: SectorExplorerProps) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    SectorCategory | "all"
  >("all");
  const normalizedQuery = normalizeSearchText(query);
  const searchedSectors = useMemo(
    () => sectors.filter((sector) => {
      const searchableContent = normalizeSearchText(
        `${sector.title} ${sector.description} ${sector.category} ${sector.searchTerms.join(" ")}`,
      );

      return searchableContent.includes(normalizedQuery);
    }),
    [normalizedQuery, sectors],
  );
  const visibleSectors =
    selectedCategory === "all"
      ? searchedSectors
      : searchedSectors.filter(
          (sector) => sector.categoryKey === selectedCategory,
        );
  const categoryCounts = new Map(
    categories.map((category) => [
      category.key,
      searchedSectors.filter((sector) => sector.categoryKey === category.key)
        .length,
    ]),
  );
  const resultCountTemplate =
    visibleSectors.length === 1
      ? labels.resultCountSingular
      : labels.resultCountPlural;
  const resultCount = resultCountTemplate.replace(
    "{count}",
    String(visibleSectors.length),
  );
  const hasActiveFilters = query.length > 0 || selectedCategory !== "all";

  const clearFilters = () => {
    setQuery("");
    setSelectedCategory("all");
  };

  return (
    <div className="sector-explorer">
      <div className="sector-explorer-heading">
        <div>
          <span className="sector-explorer-eyebrow">{labels.filterLabel}</span>
          <h3>{labels.title}</h3>
          <p>{labels.description}</p>
        </div>
        <span
          className="sector-explorer-total"
          aria-label={labels.totalCount.replace(
            "{count}",
            String(sectors.length),
          )}
        >
          <strong>{sectors.length}</strong>
          <span>{labels.totalLabel}</span>
        </span>
      </div>

      <div className="sector-explorer-tools">
        <div className="sector-search">
          <Search size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="sector-search-input">
            {labels.searchLabel}
          </label>
          <input
            autoComplete="off"
            id="sector-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                setQuery("");
              }
            }}
            placeholder={labels.searchPlaceholder}
          />
          {query && (
            <button
              className="sector-search-clear"
              type="button"
              aria-label={labels.clearSearch}
              onClick={() => setQuery("")}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="sector-category-filter" role="group" aria-label={labels.filterLabel}>
          <button
            className="sector-filter-chip"
            type="button"
            aria-pressed={selectedCategory === "all"}
            onClick={() => setSelectedCategory("all")}
          >
            {labels.allLabel}
            <span>{searchedSectors.length}</span>
          </button>
          {categories.map((category) => (
            <button
              className="sector-filter-chip"
              type="button"
              aria-pressed={selectedCategory === category.key}
              key={category.key}
              onClick={() => setSelectedCategory(category.key)}
            >
              {category.label}
              <span>{categoryCounts.get(category.key) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sector-explorer-results">
        <span aria-live="polite" aria-atomic="true">{resultCount}</span>
        {hasActiveFilters && visibleSectors.length > 0 && (
          <button
            className="sector-filters-reset"
            type="button"
            onClick={clearFilters}
          >
            {labels.clearFilters}
          </button>
        )}
      </div>

      {visibleSectors.length > 0 ? (
        <div className="sector-explorer-grid">
          {visibleSectors.map((sector) => (
            <SectorCard
              key={sector.key}
              sector={sector}
              isFeatured={sector.featured}
            />
          ))}
        </div>
      ) : (
        <div className="sector-explorer-empty">
          <span className="sector-explorer-empty-icon" aria-hidden="true">
            <Search size={20} />
          </span>
          <h4>{labels.emptyTitle}</h4>
          <p>{labels.emptyDescription}</p>
          <button type="button" onClick={clearFilters}>
            {labels.clearFilters}
          </button>
        </div>
      )}
    </div>
  );
}
