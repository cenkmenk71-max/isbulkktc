import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { requirePlatformRole } from "@/server/dal/user";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";
import { AdminTalentPoolClient } from "@/features/talent-pool/admin-talent-pool-client";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type AdminTalentPoolPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AdminTalentPoolPage({
  params,
}: AdminTalentPoolPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  await requirePlatformRole("platform_admin");

  return <AdminTalentPoolClient _locale={locale} />;
}