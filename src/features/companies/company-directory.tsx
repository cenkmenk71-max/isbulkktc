"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Mail,
  MapPin,
  MapPinned,
  Phone,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { EmployerLogo } from "@/components/jobs/employer-logo";
import {
  getCompanyDirectoryContacts,
  searchCompanyDirectory,
  sortCompanyDirectory,
  type CompanyDirectoryEntry,
} from "./directory";
import {
  getNorthernCyprusDistrictForLocation,
  northernCyprusDistricts,
} from "@/features/locations/northern-cyprus-districts";

const pageSize = 24;

export function CompanyDirectory({
  companies,
}: {
  companies: readonly CompanyDirectoryEntry[];
}) {
  const t = useTranslations("CompanyDirectory");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [district, setDistrict] = useState("");
  const [sortDirection, setSortDirection] = useState<
    "ascending" | "descending"
  >("ascending");
  const [page, setPage] = useState(1);

  const categories = useMemo(() => {
    const collator = new Intl.Collator("tr", {
      sensitivity: "base",
      numeric: true,
      ignorePunctuation: true,
    });
    return [
      ...new Set(companies.flatMap((company) => company.categories)),
    ].sort(collator.compare);
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    const results = searchCompanyDirectory(companies, {
      query,
      category,
      location: district,
    });
    return sortCompanyDirectory(results, sortDirection, query);
  }, [companies, query, category, district, sortDirection]);
  const unclassifiedLocationCount = useMemo(
    () =>
      companies.reduce(
        (count, company) =>
          count +
          company.locations.filter(
            (entryLocation) =>
              !getNorthernCyprusDistrictForLocation(entryLocation),
          ).length,
        0,
      ),
    [companies],
  );
  const pageCount = Math.max(1, Math.ceil(filteredCompanies.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstResult = (currentPage - 1) * pageSize;
  const visibleCompanies = filteredCompanies.slice(
    firstResult,
    firstResult + pageSize,
  );
  const hasFilters = Boolean(query || category || district);

  function clearFilters() {
    setQuery("");
    setCategory("");
    setDistrict("");
    setPage(1);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  function handleCategoryChange(value: string) {
    setCategory(value);
    setPage(1);
  }

  function handleDistrictChange(value: string) {
    setDistrict(value);
    setPage(1);
  }

  return (
    <section className="company-directory" aria-label={t("resultsLabel")}>
      <div className="company-directory-toolbar">
        <div className="company-directory-input">
          <label htmlFor="company-directory-search">{t("searchLabel")}</label>
          <span className="company-directory-input-control">
            <Search size={18} aria-hidden="true" />
            <input
              id="company-directory-search"
              type="search"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder={t("searchPlaceholder")}
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                className="company-directory-clear-search"
                onClick={() => handleQueryChange("")}
                aria-label={t("clearSearch")}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </span>
        </div>
        <label className="company-directory-select">
          <span>
            <SlidersHorizontal size={15} aria-hidden="true" />
            {t("categoryLabel")}
          </span>
          <select
            className="company-directory-filter-input"
            value={category}
            onChange={(event) => handleCategoryChange(event.target.value)}
          >
            <option value="">{t("categoryAll")}</option>
            {categories.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="company-directory-select">
          <span>
            <MapPin size={15} aria-hidden="true" />
            {t("locationLabel")}
          </span>
          <select
            className="company-directory-filter-input"
            value={district}
            onChange={(event) => handleDistrictChange(event.target.value)}
          >
            <option value="">{t("locationAll")}</option>
            {northernCyprusDistricts.map(({ value, key }) => (
              <option value={value} key={value}>
                {t(`districts.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="company-directory-select">
          <span>{t("sortLabel")}</span>
          <select
            value={sortDirection}
            onChange={(event) => {
              const direction =
                event.target.value === "descending"
                  ? "descending"
                  : "ascending";
              setSortDirection(direction);
              setPage(1);
            }}
          >
            <option value="ascending">{t("sortAscending")}</option>
            <option value="descending">{t("sortDescending")}</option>
          </select>
        </label>
      </div>

      <div className="company-directory-results-heading">
        <p role="status" aria-live="polite">
          {t("resultCount", { count: filteredCompanies.length })}
        </p>
        {hasFilters && (
          <button
            type="button"
            className="company-directory-reset"
            onClick={clearFilters}
          >
            <X size={14} aria-hidden="true" />
            {t("clearFilters")}
          </button>
        )}
      </div>

      {visibleCompanies.length > 0 ? (
        <div className="company-directory-grid">
          {visibleCompanies.map((company) => {
            const websites = [
              ...new Set(
                company.locations.flatMap((location) =>
                  location.website ? [location.website] : [],
                ),
              ),
            ];
            const hasContact =
              websites.length > 0 ||
              company.locations.some(
                (location) => location.phone || location.email,
              );

            return (
              <article className="company-directory-card" key={company.id}>
                <div className="company-directory-card-top">
                  <EmployerLogo
                    companyName={company.name}
                    logoUrl={company.logo ?? null}
                    aspect={company.logoAspect ?? null}
                    className="company-directory-card-icon"
                    sizes="52px"
                  />
                  <div className="company-directory-card-badges">
                    {company.categories.length > 0 && (
                      <span className="company-directory-category">
                        {company.categories[0]}
                      </span>
                    )}
                    {company.locations.length > 1 && (
                      <span className="company-directory-location-count">
                        <MapPin size={12} aria-hidden="true" />
                        {t("locationCount", {
                          count: company.locations.length,
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <h2>{company.name}</h2>
                {company.description ? (
                  <p className="company-directory-profile-description">
                    {company.description}
                  </p>
                ) : null}
                {company.categories.length > 1 && (
                  <p className="company-directory-secondary-category">
                    {company.categories.slice(1, 3).join(" · ")}
                  </p>
                )}
                <div className="company-directory-card-details">
                  {company.locations.map((location, index) => {
                    const districtLabel =
                      getNorthernCyprusDistrictForLocation(location);
                    return (
                      <div
                        className="company-directory-location"
                        key={`${company.id}:${index}`}
                      >
                        {(location.address || districtLabel) && (
                          <p>
                            <MapPin size={15} aria-hidden="true" />
                            <span>
                              {[location.address, districtLabel]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          </p>
                        )}
                        {getCompanyDirectoryContacts(location).map(
                          (contact) => {
                            const Icon =
                              contact.kind === "phone" ? Phone : Mail;
                            return (
                              <p key={contact.kind}>
                                <Icon size={15} aria-hidden="true" />
                                {contact.href ? (
                                  <a href={contact.href}>{contact.label}</a>
                                ) : (
                                  <span>{contact.label}</span>
                                )}
                              </p>
                            );
                          },
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="company-directory-card-actions">
                  {websites.map((website) => {
                    const websiteLabel = new URL(website).hostname.replace(
                      /^www\./,
                      "",
                    );
                    return (
                      <a
                        href={website}
                        key={website}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Globe2 size={15} aria-hidden="true" />
                        <span>{websiteLabel}</span>
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </a>
                    );
                  })}
                  {company.locations.map((location, index) => {
                    const mapQuery = [
                      company.name,
                      location.address,
                      getNorthernCyprusDistrictForLocation(location),
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
                    const locationSuffix =
                      company.locations.length > 1 ? ` ${index + 1}` : "";
                    const mapLabel = [
                      `${t("mapLink")}${locationSuffix}`,
                      company.name,
                      location.address,
                      getNorthernCyprusDistrictForLocation(location),
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <a
                        href={mapUrl}
                        key={`${company.id}:map:${index}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={mapLabel}
                      >
                        <MapPinned size={15} aria-hidden="true" />
                        <span>{`${t("mapLink")}${locationSuffix}`}</span>
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </a>
                    );
                  })}
                  {!hasContact && (
                    <span className="company-directory-no-contact">
                      {t("noContact")}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="company-directory-empty">
          <span>
            <Search size={20} aria-hidden="true" />
          </span>
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyDescription")}</p>
          {hasFilters && (
            <button
              type="button"
              className="button button-dark"
              onClick={clearFilters}
            >
              {t("clearFilters")}
            </button>
          )}
        </div>
      )}

      {pageCount > 1 && (
        <nav
          className="company-directory-pagination"
          aria-label={t("paginationLabel")}
        >
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={17} aria-hidden="true" />
            {t("previous")}
          </button>
          <span>
            {t("pageCount", { current: currentPage, total: pageCount })}
          </span>
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(pageCount, current + 1))
            }
            disabled={currentPage === pageCount}
          >
            {t("next")}
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </nav>
      )}

      <p className="company-directory-source-note">
        <ArrowDownRight size={15} aria-hidden="true" />
        {t("sourceNote")}
      </p>
      <p className="company-directory-source-note">
        {t("districtDataNote", { count: unclassifiedLocationCount })}
      </p>
    </section>
  );
}
