"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
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
const MAX_TILE_ASPECT = 6;
const MIN_TILE_ASPECT = 0.45;
/**
 * The chip may only grow so far before it crowds the badges and the card text
 * beside it, so very long wordmarks are drawn inside a capped-width tile
 * (`object-fit: contain` keeps them centred and legible).
 */
const MAX_TILE_RATIO = 3;

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
  const logoSrc = resolveLogoSrc(logoUrl);
  // An unknown aspect (employer-uploaded logos) is trusted as-is; a known one
  // has to sit inside the band that can be rendered legibly.
  const aspectFits =
    typeof aspect !== "number" ||
    (Number.isFinite(aspect) &&
      aspect >= MIN_TILE_ASPECT &&
      aspect <= MAX_TILE_ASPECT);
  const showLogo = Boolean(logoSrc) && failedUrl !== logoSrc && aspectFits;
  const logoRatio =
    showLogo && typeof aspect === "number" && aspect >= WIDE_TILE_MIN_ASPECT
      ? Math.min(aspect, MAX_TILE_RATIO)
      : null;

  return (
    <span
      className={`employer-logo ${
        showLogo ? "employer-logo-image" : "employer-logo-monogram"
      }${logoRatio ? " employer-logo-wide" : ""} ${className}`.trim()}
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
