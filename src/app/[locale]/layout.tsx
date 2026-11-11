import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { IBM_Plex_Sans_Arabic, Literata } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ConsentProvider } from "@/components/analytics/consent-context";
import { CookieConsent } from "@/components/analytics/cookie-consent";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { MotionController } from "@/components/motion/motion-controller";
import { PwaRuntime } from "@/components/pwa/pwa-runtime";
import { SupportWidget } from "@/features/support/support-widget";
import { buildOrganizationGraph } from "@/content/ai-visibility/structured-data";
import { JsonLd } from "@/content/ai-visibility/json-ld";
import { isRightToLeftLocale, routing } from "@/i18n/routing";
import { getDefaultSocialImage, openGraphLocales } from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";
import "@/styles/global.css";

const LiterataFont = Literata({
  axes: ["opsz"],
  display: "swap",
  preload: false,
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext"],
  style: ["normal", "italic"],
  variable: "--font-literata",
  weight: "variable",
});

const ArabicFont = IBM_Plex_Sans_Arabic({
  display: "swap",
  preload: false,
  subsets: ["arabic", "latin", "latin-ext"],
  variable: "--font-plex-arabic",
  weight: ["400", "500", "600", "700"],
});

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Pick<LocaleLayoutProps, "params">): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: "Meta" });
  const siteUrl = getAppBaseUrl();
  const socialImage = getDefaultSocialImage(locale, siteUrl);

  // Ownership proofs for the search consoles. Values come from the environment
  // so the tokens live in Vercel, not in the repository; a blank value omits its
  // tag instead of emitting an empty one.
  const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  const otherVerification = {
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim()
      ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION.trim() }
      : {}),
    ...(process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION?.trim()
      ? { "yandex-verification": process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION.trim() }
      : {}),
  };

  return {
    metadataBase: siteUrl,
    title: { default: t("title"), template: "%s · İşBul KKTC" },
    description: t("description"),
    ...(googleVerification || Object.keys(otherVerification).length > 0
      ? {
          verification: {
            ...(googleVerification ? { google: googleVerification } : {}),
            ...(Object.keys(otherVerification).length > 0
              ? { other: otherVerification }
              : {}),
          },
        }
      : {}),
    // No `robots` directive is declared here. The layout also wraps the 404
    // route, and a layout-level `googlebot: index, follow` sat beside the
    // `noindex` Next injects for a 404 as a second, contradictory directive.
    // The Googlebot display hints are declared per page instead — see
    // `createLocalizedPageMetadata` — so a 404 carries one unambiguous tag.
    //
    // RSS autodiscovery is declared here for the routes that carry no page-level
    // metadata (auth pages, the 404); the public pages declare it in
    // `createLocalizedPageMetadata`, because Next replaces `alternates` at the
    // deepest segment that declares it rather than merging the two.
    alternates: {
      types: { "application/rss+xml": "/feed.xml" },
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      siteName: "İşBul KKTC",
      type: "website",
      locale: openGraphLocales[locale],
      alternateLocale: routing.locales
        .filter((otherLocale) => otherLocale !== locale)
        .map((otherLocale) => openGraphLocales[otherLocale]),
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
      images: [{ url: socialImage.url, alt: socialImage.alt }],
    },
    icons: {
      icon: [
        {
          url: "/icon-light-32x32.png",
          media: "(prefers-color-scheme: light)",
        },
        {
          url: "/icon-dark-32x32.png",
          media: "(prefers-color-scheme: dark)",
        },
      ],
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#F5F2EB",
  // `cover` extends the layout under the notch and the home indicator so the
  // installed app can paint its own safe-area padding instead of showing letter
  // boxes. Every full-bleed surface then has to respect `env(safe-area-inset-*)`,
  // which the PWA styles do.
  viewportFit: "cover",
};

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) {
    notFound();
  }
  setRequestLocale(locale);
  const [messages] = await Promise.all([
    getMessages(),
  ]);
  const siteUrl = getAppBaseUrl();
  const organizationGraph = buildOrganizationGraph(siteUrl);

  return (
    <html
      lang={locale}
      dir={isRightToLeftLocale(locale) ? "rtl" : "ltr"}
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable} ${LiterataFont.variable} ${ArabicFont.variable}`}
    >
      <body className="flex min-h-svh flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <JsonLd data={organizationGraph} />
          <ConsentProvider>
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
            <CookieConsent />
            <GoogleAnalytics />
            <PwaRuntime />
          </ConsentProvider>
          <MotionController />
          <SupportWidget />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
