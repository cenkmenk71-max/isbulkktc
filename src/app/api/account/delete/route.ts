import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/server/db/supabase-server";
import { clientIp } from "@/features/abuse/request-context";

const DELETE_ACCOUNT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const DELETE_ACCOUNT_MAX_ATTEMPTS = 3;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + DELETE_ACCOUNT_RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= DELETE_ACCOUNT_MAX_ATTEMPTS) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  const ip = await clientIp();
  const rateLimitKey = `delete_account:${ip}`;

  if (!checkRateLimit(rateLimitKey)) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const serviceClient = createSupabaseServiceClient();
  if (!serviceClient) {
    console.error("Account deletion failed: service role key not configured.");
    return NextResponse.json(
      { error: "service_unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    console.error("Supabase account deletion failed.", {
      userId: user.id,
      code: deleteError.code,
    });
    return NextResponse.json(
      { error: "deletion_failed" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const response = NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "private, no-store" } }
  );

  const cookieNames = request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter((name) => /^(sb-|.*(auth|session|supabase)).*$/i.test(name));

  for (const name of cookieNames) {
    response.cookies.delete(name);
  }

  return response;
}
