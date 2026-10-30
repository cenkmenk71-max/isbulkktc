import { getAppBaseUrl } from "@/server/config/app-url";
import { createSupabaseServiceClient } from "@/server/db/supabase-server";
import { sendEngagementEmail } from "@/server/email/mailer";
import {
  isUnsubscribeSigningConfigured,
  signUnsubscribeEmail,
} from "@/server/email/unsubscribe-token-core";
import type { EngagementJob } from "../../../../../supabase/functions/_shared/email-render.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;
const DIGEST_JOB_COUNT = 5;

/**
 * Engagement-digest sender. Intended to run on a schedule (a cron entry hitting
 * this path with `Authorization: Bearer $ENGAGEMENT_CRON_SECRET`).
 *
 * Promotional mail is the one family that requires consent, so this route is
 * opt-out-aware: recipients come from `list_engagement_recipients`, which
 * already excludes opted-out addresses and unconfirmed mailboxes, and every
 * message carries a signed unsubscribe link. The featured jobs come from the
 * public job search, so a stale or private row can never leak.
 */

type EngagementRecipient = {
  user_id: string;
  email: string;
  display_name: string | null;
  locale: string | null;
};

export async function POST(request: Request) {
  const secret = process.env.ENGAGEMENT_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return Response.json(
      { message: "Engagement delivery is not configured" },
      { status: 503 },
    );
  }
  if (!isUnsubscribeSigningConfigured()) {
    return Response.json(
      { message: "Unsubscribe signing is not configured" },
      { status: 503 },
    );
  }

  const jobs = await loadDigestJobs();
  if (jobs.length === 0) {
    return Response.json({ message: "No jobs to feature", sent: 0 });
  }

  const siteUrl = getAppBaseUrl();
  let sent = 0;
  let failed = 0;
  let cursor: string | null = null;

  for (;;) {
    const { data, error } = await supabase.rpc("list_engagement_recipients", {
      _after: cursor,
      _batch_size: BATCH_SIZE,
    });
    if (error) {
      console.error("Engagement recipients could not be listed.", {
        code: error.code,
      });
      return Response.json(
        { message: "Recipient list is temporarily unavailable", sent, failed },
        { status: 502 },
      );
    }
    const recipients = (data ?? []) as EngagementRecipient[];
    if (recipients.length === 0) break;

    for (const recipient of recipients) {
      cursor = recipient.user_id;
      const signature = signUnsubscribeEmail(recipient.email);
      if (!signature) {
        failed += 1;
        continue;
      }
      const unsubscribeUrl = new URL("/api/email/unsubscribe", siteUrl);
      unsubscribeUrl.searchParams.set("e", recipient.email);
      unsubscribeUrl.searchParams.set("s", signature);

      try {
        await sendEngagementEmail({
          to: recipient.email,
          locale: recipient.locale,
          name: recipient.display_name,
          jobs,
          unsubscribeUrl: unsubscribeUrl.toString(),
          campaignId: `${new Date().toISOString().slice(0, 10)}/${recipient.user_id}`,
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        console.error("Engagement email could not be sent.", {
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }

    if (recipients.length < BATCH_SIZE) break;
  }

  return Response.json({ message: "Engagement digest complete", sent, failed });
}

async function loadDigestJobs(): Promise<EngagementJob[]> {
  const supabase = createSupabaseServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("search_public_jobs", {
    _query: "",
    _district: null,
    _job_type: null,
    _workplace_mode: null,
    _page: 1,
  });
  if (error || !data || typeof data !== "object") return [];

  const jobs = (data as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) return [];

  const baseUrl = getAppBaseUrl();
  return jobs.slice(0, DIGEST_JOB_COUNT).flatMap((job) => {
    if (
      typeof job !== "object" ||
      job === null ||
      typeof (job as { title?: unknown }).title !== "string" ||
      typeof (job as { slug?: unknown }).slug !== "string"
    ) {
      return [];
    }
    const title = (job as { title: string }).title;
    const slug = (job as { slug: string }).slug;
    const company = (job as { company?: { name?: unknown } }).company;
    return [
      {
        title,
        company: typeof company?.name === "string" ? company.name : "",
        url: new URL(`/jobs/${slug}`, baseUrl).toString(),
      },
    ];
  });
}
