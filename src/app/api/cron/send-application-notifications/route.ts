import { jsonNoStore } from "@/server/http/no-store-response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const secret = process.env.NOTIFICATION_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonNoStore({ message: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return jsonNoStore(
      { message: "Notification delivery is not configured" },
      { status: 503 },
    );
  }

  // The edge function authenticates with the service role key (or a dedicated
  // worker token), which this wrapper sends as the bearer token.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  let result: { claimed?: number; sent?: number; failed?: number } | null;
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-application-notifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ _batch_size: 50 }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return jsonNoStore(
        { message: "Notification delivery failed", status: response.status },
        { status: 502 },
      );
    }

    result = (await response.json()) as {
      claimed?: number;
      sent?: number;
      failed?: number;
    };
  } catch (error) {
    console.error("Application notification cron failed.", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonNoStore(
      { message: "Notification delivery is temporarily unavailable" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  return jsonNoStore({
    message: "Application notifications dispatched",
    claimed: result?.claimed ?? 0,
    sent: result?.sent ?? 0,
    failed: result?.failed ?? 0,
  });
}
