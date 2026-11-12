import { getAppBaseUrl } from "@/server/config/app-url";
import { createSupabaseServiceClient } from "@/server/db/supabase-server";
import { sendMarketingEmail } from "@/server/email/mailer";
import {
  isUnsubscribeSigningConfigured,
  unsubscribeUrlFor,
} from "@/server/email/unsubscribe-token-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;

/**
 * Acquisition-campaign sender. Intended to run on a schedule (a cron entry
 * hitting this path with `Authorization: Bearer $MARKETING_CRON_SECRET`).
 *
 * This is the caller of `sendMarketingEmail` — the acquisition family — which
 * until now existed fully rendered and tested but was never dispatched. It
 * follows the engagement-digest pattern: a bearer secret authenticates the
 * worker before any configuration is read, recipients come from a
 * `service_role`-only RPC that already excludes opted-out addresses, and every
 * message carries a signed one-click unsubscribe link.
 *
 * The recipient source is opt-in `sales_leads` only (see
 * `list_marketing_recipients`): a company that submitted the quote form asked
 * to be contacted, so this is a consented follow-up rather than cold outreach.
 * A lead is marked `contacted` after its send, so the campaign advances instead
 * of re-mailing the same people on the next run.
 */

type MarketingRecipient = {
  lead_id: string;
  email: string;
  locale: string | null;
};

// This worker can answer 4xx/5xx (bad bearer, unavailable config, RPC failure),
// and an error response carrying no `Cache-Control` of its own inherits Vercel's
// shared-cacheable default. Every response from this route is a per-request
// worker result, so none of them may be cached.
function json(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  const secret = process.env.MARKETING_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return json(
      { message: "Marketing delivery is not configured" },
      { status: 503 },
    );
  }
  if (!isUnsubscribeSigningConfigured()) {
    return json(
      { message: "Unsubscribe signing is not configured" },
      { status: 503 },
    );
  }

  const siteUrl = getAppBaseUrl();
  const day = new Date().toISOString().slice(0, 10);
  let sent = 0;
  let failed = 0;
  let cursor: string | null = null;

  for (;;) {
    const { data, error } = await supabase.rpc("list_marketing_recipients", {
      _after: cursor,
      _batch_size: BATCH_SIZE,
    });
    if (error) {
      console.error("Marketing recipients could not be listed.", {
        code: error.code,
      });
      return json(
        { message: "Recipient list is temporarily unavailable", sent, failed },
        { status: 502 },
      );
    }
    const recipients = (data ?? []) as MarketingRecipient[];
    if (recipients.length === 0) break;

    for (const recipient of recipients) {
      cursor = recipient.lead_id;
      const unsubscribeUrl = unsubscribeUrlFor(recipient.email, siteUrl);
      if (!unsubscribeUrl) {
        failed += 1;
        continue;
      }

      try {
        const accepted = await sendMarketingEmail({
          to: recipient.email,
          locale: recipient.locale,
          unsubscribeUrl,
          campaignId: `${day}/${recipient.lead_id}`,
        });
        if (!accepted) {
          // `deliver` reports a Resend rejection as a value, not a throw, so a
          // rejected send is only visible through the return value. Counting it
          // as `sent` would also mark the lead `contacted` and silently drop it
          // from every future run — a lost recipient, the one thing this worker
          // must not do.
          failed += 1;
          continue;
        }
        sent += 1;
        // Advance the lead out of the `new` queue so the next run does not
        // re-mail it. Best-effort: a failed status write leaves the lead `new`,
        // so the worst case is one duplicate on the next run, never a lost send.
        const { error: markError } = await supabase.rpc(
          "mark_marketing_lead_contacted",
          { _lead_id: recipient.lead_id },
        );
        if (markError) {
          console.warn("Marketing lead could not be marked contacted.", {
            code: markError.code,
          });
        }
      } catch (error) {
        failed += 1;
        console.error("Marketing email could not be sent.", {
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }

    if (recipients.length < BATCH_SIZE) break;
  }

  return json({ message: "Acquisition campaign complete", sent, failed });
}
