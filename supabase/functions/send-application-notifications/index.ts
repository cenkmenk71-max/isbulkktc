import { renderNotificationEmail } from "../_shared/email-render.ts";

type EventType = "submitted" | "viewed" | "status_changed";

type OutboxItem = {
  outbox_id: string;
  notification_id: string;
  recipient_user_id: string;
  recipient_email: string;
  recipient_locale: string;
  recipient_is_candidate: boolean;
  event_type: EventType;
  job_title: string;
  application_status: string;
  application_id: string;
};

function response(status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isAllowedOrigin(url: URL) {
  const localHosts = ["localhost", "127.0.0.1", "kong"];
  return (
    url.pathname === "/" &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" && localHosts.includes(url.hostname)))
  );
}

async function rpc<T>(
  supabaseUrl: string,
  serviceKey: string,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const result = await fetch(new URL(`/rest/v1/rpc/${name}`, supabaseUrl), {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!result.ok) {
    throw new Error(`supabase_rpc_${name}_${result.status}`);
  }
  return (await result.json()) as T;
}

function getEmailContent(item: OutboxItem, appUrl: URL) {
  const locale = item.recipient_locale;
  const dashboardPath = item.recipient_is_candidate
    ? "/profile/dashboard#my-applications"
    : `/company/dashboard/applications/${item.application_id}`;
  const localePrefix = locale === "tr" ? "" : `/${locale}`;
  const dashboardUrl = new URL(`${localePrefix}${dashboardPath}`, appUrl).toString();
  const siteUrl = new URL(localePrefix || "/", appUrl).toString();

  return renderNotificationEmail({
    locale,
    siteUrl,
    eventType: item.event_type,
    isCandidate: item.recipient_is_candidate,
    jobTitle: item.job_title,
    status: item.application_status,
    dashboardUrl,
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return response(405, "Method not allowed");
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // The inbound bearer is a dedicated token, not the auto-injected service key:
  // Supabase's injected SUPABASE_SERVICE_ROLE_KEY value is not readable through
  // the Management API, so it cannot be stored in Vault for the cron to send.
  // Fall back to it when no dedicated token is configured.
  const workerToken =
    Deno.env.get("NOTIFICATION_WORKER_TOKEN") ?? serviceKey;
  // Authenticate before any configuration check: an unauthenticated caller must
  // never learn whether delivery is configured, and the guard must not be
  // skipped when a secret is absent.
  if (
    !workerToken ||
    request.headers.get("authorization") !== `Bearer ${workerToken}`
  ) {
    return response(401, "Unauthorized");
  }

  const supabaseUrlValue = Deno.env.get("SUPABASE_URL");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("RESEND_FROM_EMAIL");
  const appUrlValue = Deno.env.get("APP_URL");
  if (!supabaseUrlValue || !resendApiKey || !emailFrom || !appUrlValue) {
    return response(503, "Notification delivery is not configured");
  }

  let supabaseUrl: URL;
  let appUrl: URL;
  try {
    supabaseUrl = new URL(supabaseUrlValue);
    appUrl = new URL(appUrlValue);
  } catch {
    return response(503, "Notification delivery configuration is invalid");
  }
  if (!isAllowedOrigin(supabaseUrl) || !isAllowedOrigin(appUrl) || !emailFrom.includes("@")) {
    return response(503, "Notification delivery configuration is invalid");
  }

  let batchSize = 20;
  try {
    const input = await request.json();
    if (
      typeof input === "object" &&
      input !== null &&
      "_batch_size" in input
    ) {
      const requestedSize = input._batch_size;
      if (
        typeof requestedSize !== "number" ||
        !Number.isInteger(requestedSize) ||
        requestedSize < 1 ||
        requestedSize > 100
      ) {
        return response(400, "Invalid batch size");
      }
      batchSize = requestedSize;
    }
  } catch {
    return response(400, "Invalid request body");
  }

  let items: OutboxItem[];
  try {
    items = await rpc<OutboxItem[]>(supabaseUrl.toString(), serviceKey, "claim_notification_email_outbox", {
      _batch_size: batchSize,
    });
  } catch (error) {
    console.error("Notification outbox claim failed.", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return response(502, "Notification queue is temporarily unavailable");
  }

  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const email = getEmailContent(item, appUrl);
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `application-notification/${item.notification_id}`,
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [item.recipient_email],
          subject: email.subject,
          text: email.text,
          html: email.html,
        }),
      });
      const resendResult = await resendResponse.json();

      if (
        !resendResponse.ok ||
        typeof resendResult !== "object" ||
        resendResult === null ||
        typeof resendResult.id !== "string"
      ) {
        await rpc(supabaseUrl.toString(), serviceKey, "finish_notification_email", {
          _outbox_id: item.outbox_id,
          _provider_message_id: null,
          _error_code: `resend_http_${resendResponse.status}`,
        });
        failed += 1;
        continue;
      }

      await rpc(supabaseUrl.toString(), serviceKey, "finish_notification_email", {
        _outbox_id: item.outbox_id,
        _provider_message_id: resendResult.id,
        _error_code: null,
      });
      sent += 1;
    } catch (error) {
      console.error("Application notification delivery failed.", {
        outboxId: item.outbox_id,
        error: error instanceof Error ? error.message : "unknown_error",
      });
      try {
        await rpc(supabaseUrl.toString(), serviceKey, "finish_notification_email", {
          _outbox_id: item.outbox_id,
          _provider_message_id: null,
          _error_code: "notification_delivery_error",
        });
      } catch (finishError) {
        console.error("Notification retry could not be scheduled.", {
          outboxId: item.outbox_id,
          error:
            finishError instanceof Error
              ? finishError.message
              : "unknown_error",
        });
        return response(502, "A notification could not be scheduled for retry");
      }
      failed += 1;
    }
  }

  return Response.json({ claimed: items.length, sent, failed });
});
