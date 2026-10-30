/**
 * The package tiers' accent colours, shared by the pricing experience and the
 * contrast test that guards them.
 *
 * These are the palette's shade-green ramp, not free-floating values: the
 * 10px audience label is rendered in the tier accent on the dark vending
 * panel, where the raw ramp values fall below the WCAG AA floor — `#4b8066`
 * measures 3.23:1 and `#326c54` 2.40:1 on the panel gradient. `accentInk` lifts
 * any tier accent toward white until it clears 4.5:1 on the panel's darkest
 * gradient stop, so a new tier cannot reintroduce the failure.
 */

export const packageTierColors = {
  singleListing: "#4b8066",
  growth: "#c6a46a",
  professional: "#326c54",
  enterprise: "#9cbba7",
} as const;

export type PackageTierId = keyof typeof packageTierColors;

/**
 * Percentage of the tier accent kept when mixing with white. At 65% every
 * current tier clears 5.07:1 against both ends of the panel gradient, even
 * composited over the brightest pixel the panel can sit on; the value is
 * asserted in `tests/unit/package-tier-contrast.test.ts`.
 */
export const ACCENT_INK_MIX_PERCENT = 65;

/** A tier accent that stays legible as small text on the dark panel. */
export function accentInk(color: string): string {
  return `color-mix(in srgb, ${color} ${ACCENT_INK_MIX_PERCENT}%, white)`;
}
