import { defaultInstallDestination, sanitizeNextPath } from "./destination";
import { isSupportedQrVersion, parseInstallCampaign } from "./campaign";

/**
 * The QR payload and its render options, kept apart from the route so both can
 * be asserted directly.
 *
 * A printed QR code is the one artefact in this feature that cannot be fixed
 * after the fact: a poster that encodes the wrong URL or an unscannable symbol
 * is a reprint. So the payload construction lives here as a pure function and
 * the route only serialises its result.
 */

/**
 * The module colour pair. A camera needs a wide luminance gap between the two,
 * and these are the brand ink (`#171b1a`) on the brand canvas (`#fffdf8`); the
 * ratio is well past the ~3:1 that scanner binarisers tolerate.
 */
export const qrColors = { dark: "#171b1a", light: "#fffdf8" } as const;

/**
 * Quiet-zone width in modules. The QR spec mandates 4; anything less and a
 * camera cannot reliably find the symbol's edges against a poster background.
 */
export const qrQuietZoneModules = 4;

/**
 * Error correction `M` (~15% recovery) is the usual choice for print: `L` is
 * too fragile against a scuffed poster and `H` inflates the module count enough
 * to hurt scanning at small print sizes.
 */
export const qrErrorCorrectionLevel = "M" as const;

export type QrRenderOptions = {
  errorCorrectionLevel: typeof qrErrorCorrectionLevel;
  margin: number;
  version?: number;
  color: { dark: string; light: string };
};

/**
 * Builds the absolute install URL a QR code should carry.
 *
 * Everything is validated through the same helpers the install page uses, so a
 * code this function produces can never contain a destination the page would
 * refuse, and it can never encode a foreign origin, a session, or a token.
 */
export function buildInstallQrUrl(input: {
  origin: string;
  searchParams: URLSearchParams;
}): string {
  const next = sanitizeNextPath(input.searchParams.get("next")) ?? defaultInstallDestination;
  const campaign = parseInstallCampaign(input.searchParams);

  const target = new URL("/install", input.origin);
  target.searchParams.set("next", next);
  if (campaign?.source) target.searchParams.set("utm_source", campaign.source);
  if (campaign?.medium) target.searchParams.set("utm_medium", campaign.medium);
  if (campaign?.name) target.searchParams.set("utm_campaign", campaign.name);
  if (campaign?.id) target.searchParams.set("utm_id", campaign.id);

  return target.toString();
}

export function buildQrRenderOptions(input: {
  requestedVersion: number | null;
}): QrRenderOptions {
  return {
    errorCorrectionLevel: qrErrorCorrectionLevel,
    margin: qrQuietZoneModules,
    version: isSupportedQrVersion(input.requestedVersion ?? Number.NaN)
      ? (input.requestedVersion as number)
      : undefined,
    color: { ...qrColors },
  };
}
