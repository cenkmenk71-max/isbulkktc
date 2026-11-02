/**
 * Campaign attribution for the QR install route.
 *
 * Only four fields are read, each capped and restricted to an opaque-token
 * alphabet. That is deliberate: the values end up in analytics and in the
 * install page's own copy, so anything free-form (spaces, quotes, markup,
 * URLs) is rejected outright rather than escaped. A QR code that carries a
 * rejected value simply loses that attribution dimension; it still opens the
 * right page.
 */

export type InstallCampaign = {
  source: string | null;
  medium: string | null;
  name: string | null;
  id: string | null;
};

const fieldLimits = {
  source: 64,
  medium: 64,
  name: 96,
  id: 64,
} as const;

export type CampaignField = keyof typeof fieldLimits;

// Opaque token alphabet. No spaces, no `&`/`=`, no quotes, no `%`.
const fieldPattern = /^[A-Za-z0-9._~-]+$/;

export function sanitizeCampaignValue(
  raw: string | null | undefined,
  field: CampaignField,
): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > fieldLimits[field]) return null;
  if (!fieldPattern.test(value)) return null;
  return value;
}

export function parseInstallCampaign(params: URLSearchParams): InstallCampaign | null {
  const campaign: InstallCampaign = {
    source: sanitizeCampaignValue(params.get("utm_source"), "source"),
    medium: sanitizeCampaignValue(params.get("utm_medium"), "medium"),
    name: sanitizeCampaignValue(params.get("utm_campaign"), "name"),
    id: sanitizeCampaignValue(params.get("utm_id"), "id"),
  };

  if (!campaign.source && !campaign.medium && !campaign.name && !campaign.id) {
    return null;
  }
  return campaign;
}

/** QR symbol versions the generator accepts. 1 is 21x21 modules, 40 is 177x177. */
export const minQrVersion = 1;
export const maxQrVersion = 40;

export function isSupportedQrVersion(value: number): boolean {
  return Number.isInteger(value) && value >= minQrVersion && value <= maxQrVersion;
}
