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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Engagement-digest sender. Intended to run on a schedule (a cron entry hitting
 * this path with `Authorization: Bearer $ENGAGEMENT_CRON_SECRET`).
 *
 * Promotional mail requires affirmative consent as well as opt-out suppression.
 * The live recipient RPC currently has no positive-consent predicate, so the
 * route fails closed unless the consent rollout gate is enabled after the
 * versioned consent source and SQL predicate are deployed and verified. Every
 * sent message carries a signed unsubscribe link. The featured jobs come from the
 * public job search, so a stale or private row can never leak. The route sends
 * one bounded keyset page per invocation; the cron workflow follows the returned
 * cursor, keeping each Vercel request below its 60-second execution ceiling.
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

  // An unsubscribe list is not affirmative marketing consent. The live
  // recipient RPC currently filters only active + confirmed + non-deleted
  // accounts and opt-outs. Keep this promotional sender disabled until a
  // versioned consent source and an explicit-consent SQL predicate are deployed
  // and verified together. The flag is a release gate, not a substitute for
  // those database controls.
  if (process.env.ENGAGEMENT_MARKETING_CONSENT_READY !== "true") {
    return jsonNoStore(
      { message: "Engagement marketing consent enforcement is not ready" },
      { status: 503 },
    );
  }

  const after = new URL(request.url).searchParams.get("after");
  if (after !== null && !UUID_PATTERN.test(after)) {
    return jsonNoStore({ message: "Invalid recipient cursor" }, { status: 400 });
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
    return jsonNoStore({
      message: "No jobs to feature",
      sent: 0,
      failed: 0,
      complete: true,
      nextCursor: null,
    });
  }

  const siteUrl = getAppBaseUrl();
  const campaignWeek = engagementWeekKey(new Date());
  let sent = 0;
  let failed = 0;

  const { data, error } = await supabase.rpc("list_engagement_recipients", {
    _after: after,
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
  for (const recipient of recipients) {
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
        campaignId: `${campaignWeek}/${recipient.user_id}`,
      });
      // A Resend rejection comes back as `false`, so the return value is
      // the only place a rejected send is visible.
      if (accepted) sent += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      console.error("Engagement email could not be sent.", {
        error: error instanceof Error ? error.name : "unknown_error",
      });
    }
  }

  const complete = recipients.length < BATCH_SIZE;
  const nextCursor = complete ? null : recipients[recipients.length - 1]?.user_id ?? null;
  if (!complete && (!nextCursor || nextCursor === after)) {
    console.error("Engagement recipient cursor did not advance.");
    return jsonNoStore(
      { message: "Recipient cursor did not advance", sent, failed },
      { status: 502 },
    );
  }

  return jsonNoStore({
    message: complete ? "Engagement digest complete" : "Engagement digest page complete",
    sent,
    failed,
    complete,
    nextCursor,
  });
}

/**
 * Stable campaign identity for the UTC week, so retries or workflow replays on
 * another day of the same week reuse the same provider idempotency key.
 */
export function engagementWeekKey(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    throw new RangeError("value must be a valid date");
  }
  const monday = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
  const daysSinceMonday = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  return monday.toISOString().slice(0, 10);
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
