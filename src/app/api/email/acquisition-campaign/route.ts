import { getAppBaseUrl } from "@/server/config/app-url";
import { createSupabaseServiceClient } from "@/server/db/supabase-server";
import { sendMarketingEmail } from "@/server/email/mailer";
import {
  isUnsubscribeSigningConfigured,
  unsubscribeUrlFor,
} from "@/server/email/unsubscribe-token-core";
import { jsonNoStore } from "@/server/http/no-store-response";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 25;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UTC_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Acquisition-campaign sender. Intended to run on a schedule (a cron entry
 * hitting this path with `Authorization: Bearer $MARKETING_CRON_SECRET`).
 *
 * This is the caller of `sendMarketingEmail` — the acquisition family.
 * A bearer secret authenticates the worker before configuration is read;
 * recipients come from the service-role-only `list_marketing_recipients` RPC,
 * and every message carries a signed one-click unsubscribe link.
 *
 * The recipient source is `sales_leads` only. A quote request alone does not
 * constitute marketing permission. The recipient RPC must require separately
 * requested and email-confirmed `marketing_consent`, a matching consent
 * timestamp, and absence from the shared suppression list. Legacy and
 * pending-confirmation leads must remain excluded.
 *
 * A lead is marked `contacted` only after an accepted send. The route
 * processes one bounded keyset page per invocation; the workflow follows the
 * returned cursor so a large queue cannot exceed the Vercel execution ceiling.
 * A failed send or failed status update is counted and leaves the lead
 * eligible for reconciliation.
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

export async function POST(request: Request) {
  const secret = process.env.MARKETING_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonNoStore({ message: "Unauthorized" }, { status: 401 });
  }

  // A quote request is not affirmative permission for promotional email.
  // Keep the sender closed until the consent migration, confirmation flow and
  // live recipient predicate have all been deployed and independently verified.
  if (process.env.MARKETING_CAMPAIGN_CONSENT_READY !== "true") {
    return jsonNoStore(
      { message: "Acquisition marketing consent enforcement is not ready" },
      { status: 503 },
    );
  }

  const requestUrl = new URL(request.url);
  const after = requestUrl.searchParams.get("after");
  if (after !== null && !UUID_PATTERN.test(after)) {
    return jsonNoStore({ message: "Invalid recipient cursor" }, { status: 400 });
  }

  const requestedCampaignDate = requestUrl.searchParams.get("campaignDate");
  const campaignDate = requestedCampaignDate ?? new Date().toISOString().slice(0, 10);
  const parsedCampaignDate = new Date(campaignDate + "T00:00:00.000Z");
  if (
    !UTC_DATE_PATTERN.test(campaignDate) ||
    !Number.isFinite(parsedCampaignDate.getTime()) ||
    parsedCampaignDate.toISOString().slice(0, 10) !== campaignDate
  ) {
    return jsonNoStore({ message: "Invalid campaign date" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return jsonNoStore(
      { message: "Marketing delivery is not configured" },
      { status: 503 },
    );
  }
  if (!isUnsubscribeSigningConfigured()) {
    return jsonNoStore(
      { message: "Unsubscribe signing is not configured" },
      { status: 503 },
    );
  }

  // The promotional sender must fail closed until the explicit-consent
  // migration is live. That migration adds these columns and replaces
  // list_marketing_recipients in one transaction. A zero-row schema probe
  // verifies the contract before the recipient RPC can ever lead to a send.
  // This also protects production while its migration ledger is behind main.
  const consentSchemaClient = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        limit: (count: number) => PromiseLike<{
          data: unknown;
          error: { code?: string } | null;
        }>;
      };
    };
  };
  try {
    const { data: consentSchemaRows, error: consentSchemaError } =
      await consentSchemaClient
        .from("sales_leads")
        .select(
          "marketing_consent,marketing_consent_requested_at,marketing_consent_at,marketing_consent_version",
        )
        .limit(0);

    if (consentSchemaError || !Array.isArray(consentSchemaRows)) {
      console.error("Marketing consent schema is not ready.", {
        code: consentSchemaError?.code ?? "invalid_schema_probe_result",
      });
      return jsonNoStore(
        { message: "Marketing consent schema is not ready" },
        { status: 503 },
      );
    }
  } catch (error) {
    console.error("Marketing consent schema probe failed.", {
      error: error instanceof Error ? error.name : "unknown_error",
    });
    return jsonNoStore(
      { message: "Marketing consent schema is not ready" },
      { status: 503 },
    );
  }

  const siteUrl = getAppBaseUrl();
  let sent = 0;
  let failed = 0;

  const { data, error } = await supabase.rpc("list_marketing_recipients", {
    _after: after,
    _batch_size: BATCH_SIZE,
  });
  if (error) {
    console.error("Marketing recipients could not be listed.", {
      code: error.code,
    });
    return jsonNoStore(
      { message: "Recipient list is temporarily unavailable", sent, failed },
      { status: 502 },
    );
  }

  const recipients = (data ?? []) as MarketingRecipient[];
  for (const recipient of recipients) {
    const unsubscribeUrl = unsubscribeUrlFor(recipient.email, siteUrl);
    if (!unsubscribeUrl) {
      failed += 1;
      continue;
    }

    let accepted = false;
    try {
      accepted = await sendMarketingEmail({
        to: recipient.email,
        locale: recipient.locale,
        unsubscribeUrl,
        campaignId: campaignDate + "/" + recipient.lead_id,
      });
    } catch (error) {
      failed += 1;
      console.error("Marketing email could not be sent.", {
        error: error instanceof Error ? error.name : "unknown_error",
      });
      continue;
    }

    if (!accepted) {
      // A rejected send must stay queued; do not advance the lead status.
      failed += 1;
      continue;
    }

    sent += 1;
    try {
      const { error: markError } = await supabase.rpc(
        "mark_marketing_lead_contacted",
        { _lead_id: recipient.lead_id },
      );
      if (markError) {
        // Provider accepted the mail, but the DB did not advance the lead.
        // Surface this as a failed run so the operator can reconcile/retry it.
        failed += 1;
        console.warn("Marketing lead could not be marked contacted.", {
          code: markError.code,
        });
      }
    } catch (error) {
      failed += 1;
      console.error("Marketing lead status update threw.", {
        error: error instanceof Error ? error.name : "unknown_error",
      });
    }
  }

  const complete = recipients.length < BATCH_SIZE;
  const nextCursor = complete ? null : recipients[recipients.length - 1]?.lead_id ?? null;
  if (!complete && (!nextCursor || nextCursor === after)) {
    console.error("Marketing recipient cursor did not advance.");
    return jsonNoStore(
      { message: "Recipient cursor did not advance", sent, failed },
      { status: 502 },
    );
  }

  return jsonNoStore({
    message: complete ? "Acquisition campaign complete" : "Acquisition campaign page complete",
    sent,
    failed,
    complete,
    nextCursor,
    campaignDate,
  });
}
