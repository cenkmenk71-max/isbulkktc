import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminRoleRequiredError, requirePlatformRole } from "@/server/dal/user";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";
import { AdminTalentPoolClient } from "@/features/talent-pool/admin-talent-pool-client";
import { AdminConsoleNav } from "@/components/admin/admin-console-nav";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

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
          <AdminConsoleNav />
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

  const supabase = await createSupabaseServerClient();
  const [importedResult, memberResult, entriesResult] = await Promise.all([
    supabase
      .from("talent_pool_entries")
      .select("id", { head: true, count: "exact" }),
    supabase
      .from("candidate_profiles")
      .select("id", { head: true, count: "exact" })
      .eq("visibility", "public"),
    supabase
      .from("talent_pool_entries")
      .select("id, full_name, email, phone, headline, location, skills, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const importedCandidates = importedResult.count ?? 0;
  const memberCandidates = memberResult.count ?? 0;
  const totalCandidates = importedCandidates + memberCandidates;
  const entries = (entriesResult.data ?? []) as Array<{
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    headline: string | null;
    location: string | null;
    skills: string[];
    summary: string | null;
    created_at: string;
  }>;

  return (
    <main className="admin-talent-pool-page page-container">
      <AdminConsoleNav />
      <AdminTalentPoolClient
        _locale={locale}
        totalCandidates={totalCandidates}
        importedCandidates={importedCandidates}
        memberCandidates={memberCandidates}
        entries={entries}
      />
    </main>
  );
}
