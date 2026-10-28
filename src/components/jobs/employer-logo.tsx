"use client";

import Image from "next/image";
import { useCallback, useState, type CSSProperties, type SyntheticEvent } from "react";
import { isSupportedEmployerLogoUrl } from "@/features/jobs/logo-url";
import { companyInitials, companyMarkStyle } from "@/lib/company-mark";

const localLogoPattern = /^\/logos\/[A-Za-z0-9_-]+\.webp$/;

/**
 * How a collected logo is presented inside the tile, based on its aspect ratio
 * (width / height):
 *   - square-ish artwork fills the square tile;
 *   - a horizontal wordmark widens the tile into a brand chip (same height, so
 *     the optical size stays identical) instead of collapsing to a hairline;
 *   - artwork outside the usable band (very wide banners, very tall strips) has
 *     no legible presentation at 48-76px, so the brand-toned monogram reads
 *     better.
 *
 * The band has to stay in sync with the collector: `logos:fetch` trims the
 * artwork and stores it at its own ratio, so every logo it accepts (up to 6:1)
 * must have a presentation here instead of silently collapsing to a monogram.
 */
const WIDE_TILE_MIN_ASPECT = 1.7;
const NARROW_TILE_MAX_ASPECT = 0.6;
const MAX_TILE_ASPECT = 6;
const MIN_TILE_ASPECT = 0.45;
/**
 * The chip may only grow so far before it crowds the badges and the card text
 * beside it, so very long wordmarks are drawn inside a capped-width tile
 * (`object-fit: contain` keeps them centred and legible).
 */
const MAX_TILE_RATIO = 3;
/** Portrait artwork narrows the tile, but not into a sliver. */
const MIN_TILE_RATIO = 0.6;

/**
 * Logos come from two places: uploads stored on S3/the employer API, and the
 * locally collected directory logos served from `/public/logos`. Both are
 * accepted, anything else falls back to the brand-toned monogram.
 */
function resolveLogoSrc(logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  if (localLogoPattern.test(logoUrl)) return logoUrl;
  return isSupportedEmployerLogoUrl(logoUrl) ? logoUrl : null;
}

/**
 * A wordmark widens the tile, so a `sizes` value written for the square tile
 * would under-serve the source and let the browser pick a too-small candidate.
 * Callers pass the tile edge; the width is scaled here when the tile is wide.
 */
function widenSizes(sizes: string, ratio: number | null): string {
  if (!ratio) return sizes;
  const match = /^(\d+(?:\.\d+)?)px$/.exec(sizes.trim());
  return match ? `${Math.round(Number(match[1]) * ratio)}px` : sizes;
}

export type LogoPresentation = {
  /** Width / height used to shape the tile, or null for the default square. */
  ratio: number | null;
  /** Extra class shaping the tile around the artwork. */
  variant: "" | "employer-logo-wide" | "employer-logo-narrow";
};

/**
 * Maps a logo's aspect ratio to the tile it should occupy, so any source size
 * is centred and optically consistent:
 *   - near-square artwork keeps the square tile;
 *   - a horizontal wordmark widens the tile (clamped so long marks stay legible);
 *   - portrait artwork narrows the tile on the same rule.
 * `null` means the ratio is unknown (not yet measured), which keeps the square.
 */
export function resolveLogoPresentation(
  aspect: number | null,
): LogoPresentation {
  if (typeof aspect !== "number" || !Number.isFinite(aspect)) {
    return { ratio: null, variant: "" };
  }
  if (aspect >= WIDE_TILE_MIN_ASPECT) {
    return {
      ratio: Math.min(aspect, MAX_TILE_RATIO),
      variant: "employer-logo-wide",
    };
  }
  if (aspect <= NARROW_TILE_MAX_ASPECT) {
    return {
      ratio: Math.max(aspect, MIN_TILE_RATIO),
      variant: "employer-logo-narrow",
    };
  }
  return { ratio: null, variant: "" };
}

export function EmployerLogo({
  companyName,
  logoUrl,
  aspect = null,
  className = "",
  sizes = "48px",
}: {
  companyName: string;
  logoUrl: string | null;
  /** Natural width / height of the logo, when it is known ahead of render. */
  aspect?: number | null;
  className?: string;
  sizes?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // Aspect measured from the rendered image when the caller could not supply it
  // (employer-uploaded logos on the job cards). The real ratio lets a wide
  // wordmark widen its tile instead of shrinking inside a square one, so any
  // source size is centred and optically consistent.
  const [measuredAspect, setMeasuredAspect] = useState<number | null>(null);
  const logoSrc = resolveLogoSrc(logoUrl);
  const effectiveAspect =
    typeof aspect === "number" ? aspect : measuredAspect;
  // Only a caller-supplied aspect (directory metadata) is validated against the
  // legible band; a runtime measurement is trusted and merely clamped, so a logo
  // is never hidden just because its natural ratio is unusual.
  const aspectFits =
    typeof aspect !== "number" ||
    (Number.isFinite(aspect) &&
      aspect >= MIN_TILE_ASPECT &&
      aspect <= MAX_TILE_ASPECT);
  const showLogo = Boolean(logoSrc) && failedUrl !== logoSrc && aspectFits;
  const { ratio: logoRatio, variant } = resolveLogoPresentation(
    showLogo ? effectiveAspect : null,
  );

  const handleLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      if (typeof aspect === "number") return;
      const { naturalWidth, naturalHeight } = event.currentTarget;
      if (!naturalWidth || !naturalHeight) return;
      const ratio = naturalWidth / naturalHeight;
      setMeasuredAspect((current) =>
        current !== null && Math.abs(current - ratio) < 0.01 ? current : ratio,
      );
    },
    [aspect],
  );

  return (
    <span
      className={`employer-logo ${
        showLogo ? "employer-logo-image" : "employer-logo-monogram"
      }${variant ? ` ${variant}` : ""} ${className}`.trim()}
      style={
        logoRatio
          ? ({ "--logo-ratio": logoRatio } as CSSProperties)
          : showLogo
            ? undefined
            : companyMarkStyle(companyName)
      }
      aria-hidden="true"
    >
      {showLogo && logoSrc ? (
        <Image
          src={logoSrc}
          alt=""
          fill
          sizes={widenSizes(sizes, logoRatio)}
          quality={90}
          onLoad={handleLoad}
          onError={() => setFailedUrl(logoSrc)}
        />
      ) : (
        <span className="employer-logo-initials">
          {companyInitials(companyName)}
        </span>
      )}
    </span>
  );
}
