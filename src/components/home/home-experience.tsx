import Image, { type StaticImageData } from "next/image";
import { MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import girnePhoto from "../../../public/images/Girne.webp";
import gazimagusaPhoto from "../../../public/images/Gazimağusa.webp";
import guzelyurtPhoto from "../../../public/images/güzelyurt.jpg";
import iskelePhoto from "../../../public/images/iskele.jpg";
import lefkosaPhoto from "../../../public/images/lefkoşa.jpeg";
import lefkePhoto from "../../../public/images/lefke.jpg";
import agriculturePhoto from "../../../assets-src/sector-photos/pexels-nc-farm-bureau-mark-28513536.jpg";
import architecturePhoto from "../../../assets-src/sector-photos/pexels-a-darmel-7641896.jpg";
import businessServicesPhoto from "../../../assets-src/sector-photos/pexels-august-de-richelieu-4427422.jpg";
import constructionPhoto from "../../../assets-src/sector-photos/pexels-anthonyshkraba-production-8278912.jpg";
import creativeMediaPhoto from "../../../assets-src/sector-photos/pexels-jonathanborba-13451104.jpg";
import educationPhoto from "../../../assets-src/sector-photos/pexels-max-fischer-5212338.jpg";
import foodProductionPhoto from "../../../assets-src/sector-photos/pexels-silverkblack-36697940.jpg";
import gastronomyPhoto from "../../../assets-src/sector-photos/pexels-emris-17086288.jpg";
import healthPhoto from "../../../assets-src/sector-photos/pexels-shvetsa-6291246.jpg";
import hospitalityPhoto from "../../../assets-src/sector-photos/pexels-quang-nguyen-vinh-222549-14036250.jpg";
import logisticsPhoto from "../../../assets-src/sector-photos/pexels-shuaizhi-tian-485596-20715652.jpg";
import manufacturingPhoto from "../../../assets-src/sector-photos/pexels-frans-van-heerden-201846-13974251.jpg";
import remoteWorkPhoto from "../../../assets-src/sector-photos/pexels-mikhail-nilov-8297074.jpg";
import renewableEnergyPhoto from "../../../assets-src/sector-photos/pexels-nc-farm-bureau-mark-15751132.jpg";
import technologyPhoto from "../../../assets-src/sector-photos/pexels-zayed-hossain-52728970-36706460.jpg";
import tourismPhoto from "../../../assets-src/sector-photos/pexels-imda-12160204.jpg";
import { HomeJobSearch, type HomeJobSearchData } from "@/components/home/home-job-search";
import { HomeJourneys } from "@/components/home/home-journeys";
import { SignatureBanner } from "@/components/home/signature-banner";
import {
  SectorCard,
  type SectorCardData,
  type SectorCategory,
  type SectorIconName,
} from "@/components/home/sector-card";
import { SectorDirectory } from "@/components/home/sector-directory";
import { SectorExplorer } from "@/components/home/sector-explorer";
import type { AppLocale } from "@/i18n/routing";

type SectorDefinition = {
  key: string;
  style: string;
  image: StaticImageData;
  icon: SectorIconName;
  category: SectorCategory;
  featured: boolean;
  searchTerms: readonly string[];
};

const sectors = [
  {
    key: "technology",
    style: "tech",
    image: technologyPhoto,
    icon: "Code2",
    category: "digital",
    featured: true,
    searchTerms: ["yazilim", "bilisim", "it", "software", "developer", "computer"],
  },
  {
    key: "education",
    style: "education",
    image: educationPhoto,
    icon: "GraduationCap",
    category: "services",
    featured: true,
    searchTerms: ["ogretmen", "teacher", "egitimci", "academic", "training"],
  },
  {
    key: "health",
    style: "health",
    image: healthPhoto,
    icon: "HeartPulse",
    category: "services",
    featured: true,
    searchTerms: ["saglik", "doktor", "hekim", "nurse", "doctor", "medical"],
  },
  {
    key: "tourism",
    style: "tourism",
    image: tourismPhoto,
    icon: "Palmtree",
    category: "services",
    featured: true,
    searchTerms: ["turizm", "seyahat", "travel", "tourism", "gezi"],
  },
  {
    key: "architecture",
    style: "architecture",
    image: architecturePhoto,
    icon: "Ruler",
    category: "industry",
    featured: false,
    searchTerms: ["mimarlik", "tasarim", "interior", "architect", "designer"],
  },
  {
    key: "construction",
    style: "construction",
    image: constructionPhoto,
    icon: "HardHat",
    category: "industry",
    featured: false,
    searchTerms: ["insaat", "muhendis", "engineer", "construction", "altyapi"],
  },
  {
    key: "businessServices",
    style: "business-services",
    image: businessServicesPhoto,
    icon: "BriefcaseBusiness",
    category: "services",
    featured: false,
    searchTerms: ["danisman", "consultant", "hukuk", "legal", "finans", "accounting"],
  },
  {
    key: "gastronomy",
    style: "gastronomy",
    image: gastronomyPhoto,
    icon: "ChefHat",
    category: "services",
    featured: false,
    searchTerms: ["gastronomi", "restoran", "asci", "chef", "restaurant", "food"],
  },
  {
    key: "manufacturing",
    style: "manufacturing",
    image: manufacturingPhoto,
    icon: "Factory",
    category: "industry",
    featured: false,
    searchTerms: ["uretim", "sanayi", "fabrika", "manufacturing", "production"],
  },
  {
    key: "creativeMedia",
    style: "creative-media",
    image: creativeMediaPhoto,
    icon: "Palette",
    category: "digital",
    featured: false,
    searchTerms: ["tasarim", "grafik", "creative", "media", "designer", "content"],
  },
  {
    key: "remoteWork",
    style: "remote-work",
    image: remoteWorkPhoto,
    icon: "Laptop",
    category: "digital",
    featured: false,
    searchTerms: ["uzaktan", "freelance", "remote", "serbest", "independent"],
  },
  {
    key: "renewableEnergy",
    style: "renewable-energy",
    image: renewableEnergyPhoto,
    icon: "SolarPanel",
    category: "industry",
    featured: false,
    searchTerms: ["enerji", "gunes", "solar", "renewable", "surdurulebilir"],
  },
  {
    key: "agriculture",
    style: "agriculture",
    image: agriculturePhoto,
    icon: "Sprout",
    category: "industry",
    featured: false,
    searchTerms: ["tarim", "seracilik", "ciftci", "agriculture", "farming", "greenhouse"],
  },
  {
    key: "foodProduction",
    style: "food-production",
    image: foodProductionPhoto,
    icon: "Package",
    category: "industry",
    featured: false,
    searchTerms: ["gida", "tedarik", "food", "supply", "production", "paketleme"],
  },
  {
    key: "hospitality",
    style: "hospitality",
    image: hospitalityPhoto,
    icon: "Hotel",
    category: "services",
    featured: false,
    searchTerms: ["otel", "konaklama", "hospitality", "hotel", "guest"],
  },
  {
    key: "logistics",
    style: "logistics",
    image: logisticsPhoto,
    icon: "Truck",
    category: "industry",
    featured: false,
    searchTerms: ["lojistik", "tasimacilik", "nakliye", "transport", "shipping", "warehouse"],
  },
] as const satisfies readonly SectorDefinition[];

const featuredSectors = sectors.filter((sector) => sector.featured);
const homeHeroSlides = [
  { district: "girne", asset: "/images/Girne.webp", src: girnePhoto },
  { district: "gazimagusa", asset: "/images/Gazimağusa.webp", src: gazimagusaPhoto },
  { district: "guzelyurt", asset: "/images/güzelyurt.jpg", src: guzelyurtPhoto },
  { district: "iskele", asset: "/images/iskele.jpg", src: iskelePhoto },
  { district: "lefkosa", asset: "/images/lefkoşa.jpeg", src: lefkosaPhoto },
  { district: "lefke", asset: "/images/lefke.jpg", src: lefkePhoto },
] as const;

export async function HomeExperience({
  locale,
  jobSearch,
}: {
  locale: AppLocale;
  jobSearch: HomeJobSearchData;
}) {
  const copy = await getTranslations({ locale, namespace: "HomePage" });
  const getSectorCard = (
    sector: (typeof sectors)[number],
  ): SectorCardData => ({
    key: sector.key,
    style: sector.style,
    image: sector.image,
    icon: sector.icon,
    title: copy(`sectors.${sector.key}.title`),
    description: copy(`sectors.${sector.key}.description`),
    category: copy(`sectorCategories.${sector.category}`),
    categoryBadge: copy(`sectorCategoryBadges.${sector.category}`),
    categoryKey: sector.category,
    searchTerms: [...sector.searchTerms],
    featuredLabel: copy("sectorFeaturedLabel"),
    featured: sector.featured,
  });
  const allSectorData = sectors.map(getSectorCard);

  return (
    <div className="home-page">
      <section id="top" className="hero-section" aria-labelledby="home-title">
        <div className="hero-photo" aria-hidden="true">
          {homeHeroSlides.map((slide) => (
            <Image
              key={slide.district}
              src={slide.src}
              alt=""
              fill
              loading={slide.district === "girne" || slide.district === "gazimagusa" ? "eager" : "lazy"}
              fetchPriority={slide.district === "girne" ? "high" : "low"}
              sizes="100vw"
              quality={90}
              className="hero-photo-image home-hero-slide"
              data-home-hero-photo={slide.district}
              data-home-hero-source={slide.asset}
            />
          ))}
        </div>
        <div className="hero-light-layer hero-light-layer--readability" aria-hidden="true" />
        <div className="hero-light-layer hero-light-layer--warmth" aria-hidden="true" />
        <div className="hero-light-layer hero-light-layer--vignette" aria-hidden="true" />
        <div className="home-hero-rays" aria-hidden="true" />
        <div className="page-container hero-layout">
          <div className="hero-copy">
            <div className="eyebrow hero-eyebrow">
              <span className="hero-eyebrow-dot" aria-hidden="true" />
              <span>{copy("eyebrow")}</span>
            </div>
            <h1 id="home-title" className="hero-title-source-copy">
              {copy.rich("title", {
                line: (chunks) => <span className="hero-title-line">{chunks}</span>,
                accent: (chunks) => <span className="hero-title-accent">{chunks}</span>,
              })}
            </h1>
          </div>
        </div>
      </section>

      <HomeJobSearch locale={locale} {...jobSearch} />
      <HomeJourneys locale={locale} />

      <section className="sector-showcase" aria-labelledby="sector-heading">
        <div className="page-container">
          <div className="sector-heading">
            <div>
              <span className="sector-kicker">{copy("sectorEyebrow")}</span>
              <h2 id="sector-heading">{copy("sectorTitle")}</h2>
            </div>
            <span className="sector-heading-note">
              <MapPin size={15} aria-hidden="true" />
              {copy("sectorRegion")}
            </span>
          </div>
          <SectorDirectory
            itemCount={sectors.length}
            openLabel={copy("sectorMoreLabel")}
            closeLabel={copy("sectorLessLabel")}
            featured={
              <div className="sector-card-grid">
                {featuredSectors.map((sector) => (
                  <SectorCard
                    key={sector.key}
                    sector={getSectorCard(sector)}
                    showCategory={false}
                  />
                ))}
              </div>
            }
          >
            <SectorExplorer
              sectors={allSectorData}
              categories={(["digital", "services", "industry"] as const).map(
                (key) => ({
                  key,
                  label: copy(`sectorCategories.${key}`),
                }),
              )}
              labels={{
                title: copy("sectorExplorerTitle"),
                description: copy("sectorExplorerDescription"),
                searchLabel: copy("sectorSearchLabel"),
                searchPlaceholder: copy("sectorSearchPlaceholder"),
                filterLabel: copy("sectorFilterLabel"),
                allLabel: copy("sectorAllLabel"),
                totalLabel: copy("sectorTotalLabel"),
                totalCount: copy("sectorTotalCount", { count: "{count}" }),
                resultCountSingular: copy(
                  "sectorResultCountSingular",
                  { count: "{count}" },
                ),
                resultCountPlural: copy(
                  "sectorResultCountPlural",
                  { count: "{count}" },
                ),
                clearSearch: copy("sectorClearSearch"),
                emptyTitle: copy("sectorEmptyTitle"),
                emptyDescription: copy("sectorEmptyDescription"),
                clearFilters: copy("sectorClearFilters"),
              }}
            />
          </SectorDirectory>
        </div>
      </section>

      <SignatureBanner />
    </div>
  );
}
