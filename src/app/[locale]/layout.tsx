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
import { GoogleAnalyticsConsent } from "@/components/analytics/google-analytics-consent";
import { MotionController } from "@/components/motion/motion-controller";
import { isRightToLeftLocale, routing } from "@/i18n/routing";
import { getLocalizedSocialImageAlt } from "@/lib/seo";
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
  const socialImage = new URL("/images/Girne.webp", siteUrl);
  const openGraphLocales = {
    tr: "tr_TR",
    en: "en_GB",
    ru: "ru_RU",
    el: "el_GR",
    fa: "fa_IR",
    de: "de_DE",
  } satisfies Record<(typeof routing.locales)[number], string>;

  return {
    metadataBase: siteUrl,
    title: { default: t("title"), template: "%s · İşBul KKTC" },
    description: t("description"),
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
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
      images: [
        {
          url: socialImage,
          width: 3840,
          height: 2500,
          alt: getLocalizedSocialImageAlt(locale),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
      images: [socialImage],
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
      apple: "/apple-icon.png",
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#F5F2EB",
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
  const websiteStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": new URL("#website", siteUrl).toString(),
        name: "İşBul KKTC",
        url: siteUrl.toString(),
        description: "Kuzey Kıbrıs Türk Cumhuriyeti'nin güvenilir kariyer, istihdam ve iş ilanı platformu.",
        inLanguage: routing.locales,
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteUrl.origin}/jobs?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "EmploymentAgency",
        "@id": new URL("#organization", siteUrl).toString(),
        name: "İşBul KKTC",
        url: siteUrl.toString(),
        logo: new URL("/icon-dark-32x32.png", siteUrl).toString(),
        description: "Kuzey Kıbrıs genelinde iş arayanlar ve işverenleri bir araya getiren istihdam platformu.",
        areaServed: {
          "@type": "AdministrativeArea",
          name: "Kuzey Kıbrıs Türk Cumhuriyeti",
        },
      },
    ],
  };

  return (
    <html
      lang={locale}
      dir={isRightToLeftLocale(locale) ? "rtl" : "ltr"}
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable} ${LiterataFont.variable} ${ArabicFont.variable}`}
    >
      <body className="flex min-h-svh flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(websiteStructuredData).replace(/</g, "\\u003c"),
            }}
          />
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          <GoogleAnalyticsConsent />
          <MotionController />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
