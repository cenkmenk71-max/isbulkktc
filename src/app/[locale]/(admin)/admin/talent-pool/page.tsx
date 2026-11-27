import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminRoleRequiredError, requirePlatformRole } from "@/server/dal/user";
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
  try {
    await requirePlatformRole("platform_admin");
  } catch (error) {
    if (error instanceof AdminRoleRequiredError) {
      return (
        <main className="page-container">
          <section aria-labelledby="admin-role-required-title">
            <h2 id="admin-role-required-title">Yönetici yetkisi gerekli</h2>
            <p>
              Bu sayfaya erişmek için platform yöneticisi
              (platform_admin) yetkisine sahip olmalısınız.
            </p>
          </section>
        </main>
      );
    }
    throw error;
  }

  return <AdminTalentPoolClient _locale={locale} />;
}