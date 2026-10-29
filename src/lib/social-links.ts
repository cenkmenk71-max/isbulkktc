/**
 * Public support and social channels.
 *
 * Only channels with a real, operator-provided URL are rendered. A channel
 * without a configured URL is dropped rather than linked to a placeholder, so
 * the footer never ships a dead or invented link.
 */

export type SocialChannel = {
  id: string;
  label: string;
  href: string;
};

function fromEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//.test(trimmed)) return null;
  return trimmed;
}

export const SUPPORT_EMAIL = "info@isbulkktc.com";
export const SUPPORT_PHONE_DISPLAY = "0539 131 64 21";
export const SUPPORT_PHONE_TEL = "+905391316421";

export function getWhatsAppUrl(): string {
  return `https://wa.me/${SUPPORT_PHONE_TEL.replace(/[^0-9]/g, "")}`;
}

export function getSupportMailto(subject?: string, body?: string): string {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const query = params.toString();
  return `mailto:${SUPPORT_EMAIL}${query ? `?${query}` : ""}`;
}

/**
 * Ordered list of social profiles the operator has actually set up. Reads
 * `NEXT_PUBLIC_*` values so the links are present in the static footer, and
 * skips any entry whose URL is missing.
 */
export function getSocialChannels(): SocialChannel[] {
  const candidates: Array<{ id: string; label: string; value?: string }> = [
    {
      id: "instagram",
      label: "Instagram",
      value: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL,
    },
    {
      id: "facebook",
      label: "Facebook",
      value: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK_URL,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      value: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN_URL,
    },
    {
      id: "youtube",
      label: "YouTube",
      value: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE_URL,
    },
    {
      id: "x",
      label: "X",
      value: process.env.NEXT_PUBLIC_SOCIAL_X_URL,
    },
  ];

  return candidates.flatMap(({ id, label, value }) => {
    const href = fromEnv(value);
    return href ? [{ id, label, href }] : [];
  });
}
