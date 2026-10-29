import Image, { type StaticImageData } from "next/image";
import {
  BriefcaseBusiness,
  ChefHat,
  Code2,
  Factory,
  GraduationCap,
  HardHat,
  HeartPulse,
  Hotel,
  Laptop,
  Package,
  Palette,
  Palmtree,
  Ruler,
  SolarPanel,
  Sprout,
  Truck,
} from "lucide-react";

const sectorIcons = {
  BriefcaseBusiness,
  ChefHat,
  Code2,
  Factory,
  GraduationCap,
  HardHat,
  HeartPulse,
  Hotel,
  Laptop,
  Package,
  Palette,
  Palmtree,
  Ruler,
  SolarPanel,
  Sprout,
  Truck,
} as const;

export type SectorIconName = keyof typeof sectorIcons;
export type SectorCategory = "digital" | "services" | "industry";

export type SectorCardData = {
  key: string;
  style: string;
  image: StaticImageData;
  icon: SectorIconName;
  title: string;
  description: string;
  category: string;
  categoryBadge: string;
  categoryKey: SectorCategory;
  searchTerms: string[];
  featuredLabel: string;
  featured?: boolean;
};

export function SectorCard({
  sector,
  showCategory = true,
  isFeatured = false,
}: {
  sector: SectorCardData;
  showCategory?: boolean;
  isFeatured?: boolean;
}) {
  const Icon = sectorIcons[sector.icon];

  return (
    <article
      className={`sector-card sector-${sector.style}`}
      data-sector={sector.key}
      data-sector-image={sector.image.src}
      data-sector-category={sector.category}
    >
      <div className="sector-image">
        <Image
          src={sector.image}
          alt=""
          fill
          sizes="(max-width: 1100px) 50vw, 25vw"
          quality={90}
          className="sector-photo"
        />
        {showCategory && (
          <span className="sector-image-category">{sector.categoryBadge}</span>
        )}
      </div>
      <span className="sector-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="sector-card-copy">
        <span>
          <strong>{sector.title}</strong>
          <small>{sector.description}</small>
          {isFeatured && (
            <span className="sector-featured-marker">{sector.featuredLabel}</span>
          )}
        </span>
      </div>
    </article>
  );
}
