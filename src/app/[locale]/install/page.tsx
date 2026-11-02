import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { defaultInstallDestination, sanitizeNextPath } from "@/lib/pwa/destination";
import { parseInstallCampaign } from "@/lib/pwa/campaign";
import { getVapidPublicKey } from "@/server/push/vapid";
import { getAppBaseUrl } from "@/server/config/app-url";
import { InstallExperience } from "@/features/pwa/install-experience";

type InstallRouteProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The QR entry point.
 *
 * Printed QR codes point here because it is the one route that can ask "what
 * device is this?" before deciding what to show, and because the install journey
 * needs a stable URL that never carries a session or a token.
 *
 * Everything it accepts is validated before it is used:
 *  - `next` must be a same-origin path (see `sanitizeNextPath`); an open redirect
 *    in a printed QR code is a phishing vector, so anything else is dropped and
 *    the visitor continues to the job list.
 *  - campaign fields must be opaque tokens, so the page's own copy can never be
 *    injected into.
 *
 * The page is `noindex`: it is an app entry, not content, and its variants would
 * otherwise become an indexable duplicate surface.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: InstallRouteProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find((entry) => entry === requestedLocale);
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "InstallMeta" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: true },
    // An install landing page reached from a poster has no canonical duplicate
    // to consolidate, and the page exists in every locale at its own URL.
    alternates: { canonical: `${getAppBaseUrl().origin}${locale === "tr" ? "" : `/${locale}`}/install` },
  };
}

export default async function InstallRoute({ params, searchParams }: InstallRouteProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find((entry) => entry === requestedLocale);
  if (!locale) notFound();

  setRequestLocale(locale);

  const query = await searchParams;
  const rawNext = typeof query.next === "string" ? query.next : null;
  const next = sanitizeNextPath(rawNext) ?? defaultInstallDestination;

  const campaignParams = new URLSearchParams();
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_id"]) {
    const value = query[key];
    if (typeof value === "string") campaignParams.set(key, value);
  }
  const campaign = parseInstallCampaign(campaignParams);

  const t = await getTranslations({ locale, namespace: "Install" });

  return (
    <InstallExperience
      destination={next}
      destinationWasRequested={sanitizeNextPath(rawNext) !== null}
      campaign={campaign}
      vapidPublicKey={getVapidPublicKey()}
      locale={locale}
      copy={{
        // Only the strings that vary per platform decision are passed from the
        // server; the rest is read from the message catalog on the client so
        // every locale stays in one place.
        title: t("title"),
      }}
    />
  );
}
