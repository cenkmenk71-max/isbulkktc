import { getAppBaseUrl } from "@/server/config/app-url";
import { createSupabaseServiceClient } from "@/server/db/supabase-server";
import { sendEngagementEmail } from "@/server/email/mailer";
import { jsonNoStore } from "@/server/http/no-store-response";
import {
  isUnsubscribeSigningConfigured,
  unsubscribeUrlFor,
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
    return jsonNoStore({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return jsonNoStore(
      { message: "Engagement delivery is not configured" },
      { status: 503 },
    );
  }
  if (!isUnsubscribeSigningConfigured()) {
    return jsonNoStore(
      { message: "Unsubscribe signing is not configured" },
      { status: 503 },
    );
  }

  let jobs: EngagementJob[];
  try {
    jobs = await loadDigestJobs(supabase);
  } catch (error) {
    console.error("Digest jobs could not be loaded.", {
      error: error instanceof Error ? error.name : "unknown_error",
    });
    return jsonNoStore(
      { message: "Featured jobs are temporarily unavailable" },
      { status: 502 },
    );
  }
  if (jobs.length === 0) {
    return jsonNoStore({ message: "No jobs to feature", sent: 0 });
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
      return jsonNoStore(
        { message: "Recipient list is temporarily unavailable", sent, failed },
        { status: 502 },
      );
    }
    const recipients = (data ?? []) as EngagementRecipient[];
    if (recipients.length === 0) break;

    for (const recipient of recipients) {
      cursor = recipient.user_id;
      const unsubscribeUrl = unsubscribeUrlFor(recipient.email, siteUrl);
      if (!unsubscribeUrl) {
        failed += 1;
        continue;
      }

      try {
        const accepted = await sendEngagementEmail({
          to: recipient.email,
          locale: recipient.locale,
          name: recipient.display_name,
          jobs,
          unsubscribeUrl,
          campaignId: `${new Date().toISOString().slice(0, 10)}/${recipient.user_id}`,
        });
        // A Resend rejection comes back as `false`, not a throw, so the return
        // value is the only place a rejected send is visible.
        if (accepted) sent += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        console.error("Engagement email could not be sent.", {
          error: error instanceof Error ? error.name : "unknown_error",
        });
      }
    }

    if (recipients.length < BATCH_SIZE) break;
  }

  return jsonNoStore({ message: "Engagement digest complete", sent, failed });
}

async function loadDigestJobs(
  supabase: NonNullable<ReturnType<typeof createSupabaseServiceClient>>,
): Promise<EngagementJob[]> {
  const { data, error } = await supabase.rpc("search_public_jobs", {
    _query: "",
    _district: null,
    _job_type: null,
    _workplace_mode: null,
    _page: 1,
  });
  if (error) throw new Error("search_public_jobs_failed", { cause: error });
  if (!data || typeof data !== "object") {
    throw new Error("search_public_jobs_returned_no_data");
  }

  const jobs = (data as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) {
    throw new Error("search_public_jobs_returned_invalid_shape");
  }

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
