import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Re-registration endpoint for the service worker's `pushsubscriptionchange`
 * handler.
 *
 * A browser rotates a subscription on its own schedule (key rotation, profile
 * restore, a push service migration). When that happens the old endpoint stops
 * accepting deliveries and the server has no way to learn about the new one —
 * the browser only fires the event, and only the page's service worker can
 * receive it. This route is how the new subscription reaches the database.
 *
 * Authentication is the session cookie, which a same-origin `fetch` from the
 * service worker sends automatically. Without a session the request is refused:
 * an unauthenticated endpoint here would be an open door for writing arbitrary
 * push credentials.
 */

const payloadSchema = z.object({
  endpoint: z.string().url().min(12).max(1024).startsWith("https://"),
  keys: z.object({
    p256dh: z.string().min(16).max(256),
    auth: z.string().min(8).max(128),
  }),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid body" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ message: "Invalid subscription" }, { status: 422 });
  }

  const { error } = await supabase.rpc("register_push_subscription", {
    _endpoint: parsed.data.endpoint,
    _p256dh: parsed.data.keys.p256dh,
    _auth_key: parsed.data.keys.auth,
    _user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });

  if (error) {
    return Response.json({ message: "Subscription could not be stored" }, { status: 502 });
  }
  return Response.json({ message: "ok" });
}
