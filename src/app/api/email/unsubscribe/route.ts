import { createSupabaseServiceClient } from "@/server/db/supabase-server";
import { verifyUnsubscribeSignature } from "@/server/email/unsubscribe-token-core";

export const dynamic = "force-dynamic";

/**
 * One-click engagement-digest opt-out.
 *
 * The link is followed from a mailbox, so there is no session: authority comes
 * entirely from the HMAC in `s`. A valid signature writes the address to
 * `email_engagement_optouts` through a service-role RPC; anything else is a
 * 400. The response is deliberately the same for an already-opted-out address,
 * so the endpoint cannot be used to test whether an address is subscribed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = (url.searchParams.get("e") ?? "").trim().toLowerCase();
  const signature = url.searchParams.get("s") ?? "";

  if (
    email.length < 3 ||
    email.length > 254 ||
    !verifyUnsubscribeSignature(email, signature)
  ) {
    return new Response("Invalid or expired unsubscribe link.", { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return new Response("Unsubscribe is temporarily unavailable.", {
      status: 503,
    });
  }

  const { error } = await supabase.rpc("opt_out_engagement", {
    _email: email,
    _reason: "email_link",
  });

  if (error) {
    console.error("Engagement opt-out could not be stored.", {
      code: error.code,
    });
    return new Response("Unsubscribe is temporarily unavailable.", {
      status: 503,
    });
  }

  return new Response(
    [
      "İşBul KKTC",
      "",
      "Bu adres tanıtım e-postalarından çıkarıldı.",
      "This address has been removed from promotional emails.",
      "",
      "İş başvurularınız ve hesabınızla ilgili bilgilendirme e-postaları",
      "bundan etkilenmez.",
    ].join("\n"),
    {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
