/**
 * Backwards-compatible façade over the shared email layout.
 *
 * The branded shell now lives in `email-layout.ts`, which every İşBul KKTC
 * email (auth, welcome, notification, feedback) uses. This module keeps the
 * original `renderBrandedEmail` / `BRAND` / `escapeHtml` surface so existing
 * callers and unit tests keep working while new code imports the richer
 * renderers from `email-render.ts`.
 */

export { BRAND, escapeHtml, LOGO_URL } from "./email-layout.ts";
import { renderEmailLayout } from "./email-layout.ts";

export type BrandedEmailOptions = {
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
  siteUrl: string;
};

export function renderBrandedEmail(options: BrandedEmailOptions): string {
  const { preheader, heading, body, ctaLabel, ctaUrl, footerNote, siteUrl } =
    options;
  return renderEmailLayout({
    preheader,
    heading,
    introHtml: body,
    button: { label: ctaLabel, url: ctaUrl },
    footerNote,
    siteUrl,
  });
}
