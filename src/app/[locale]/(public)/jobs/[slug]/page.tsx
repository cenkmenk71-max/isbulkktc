import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { JobDetailExperience } from "@/components/jobs/job-detail-experience";
import { buildJobPostingStructuredData } from "@/features/jobs/job-posting-structured-data";
import { publicJobSlugSchema } from "@/features/jobs/schemas";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";
import { getPublicJobBySlug } from "@/server/dal/jobs";

type JobDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({
  params,
}: JobDetailPageProps): Promise<Metadata> {
  const { locale: requestedLocale, slug } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  const validSlug = publicJobSlugSchema.safeParse(slug);
  if (!locale || !validSlug.success) notFound();

  const job = await getPublicJobBySlug(validSlug.data);
  if (!job) notFound();

  return createLocalizedPageMetadata({
    locale,
    pathname: `/jobs/${job.slug}`,
    title: job.title,
    description: job.summary,
    // Imported listings carry Turkish text in every locale, so each localized
    // URL canonicalises to the default-locale page rather than publishing six
    // copies of the same vacancy.
    contentLocale: routing.defaultLocale,
  });
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { locale: requestedLocale, slug } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  const validSlug = publicJobSlugSchema.safeParse(slug);
  if (!locale || !validSlug.success) notFound();

  setRequestLocale(locale);
  const job = await getPublicJobBySlug(validSlug.data);
  if (!job) notFound();

  const jobPostingStructuredData = buildJobPostingStructuredData({
    job,
    baseUrl: getAppBaseUrl(),
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jobPostingStructuredData).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <JobDetailExperience locale={locale} job={job} />
    </>
  );
}
