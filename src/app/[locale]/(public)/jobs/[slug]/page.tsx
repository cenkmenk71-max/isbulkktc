import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { JobDetailExperience } from "@/components/jobs/job-detail-experience";
import { publicJobSlugSchema } from "@/features/jobs/schemas";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";
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

  return <JobDetailExperience locale={locale} job={job} />;
}
