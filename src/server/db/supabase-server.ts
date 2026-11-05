import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

function getSupabaseEnv() {
  return {
    url:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://placeholder-isbulkktc.supabase.co",
    key:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder",
  };
}

/**
 * Service-role client. Bypasses RLS, so it must only ever be used from a server
 * task that has already established its own authority (the engagement cron and
 * the signed unsubscribe route) — never from a request whose actor is a user.
 * Returns null when the key is absent so callers can degrade instead of throwing.
 */
export function createSupabaseServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  const { url } = getSupabaseEnv();
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cookie-free anonymous client. Use it where a request's session must not leak
 * into the result and `cookies()` would needlessly opt a route out of static
 * generation or ISR — the sitemap is the current caller. Only the public
 * `search_public_*` / `get_public_*` RPCs are reachable with the publishable key.
 */
export function createSupabasePublicClient() {
  const { url, key } = getSupabaseEnv();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type SupabaseServerOptions = {
  allowCookieWrites?: boolean;
  /**
   * Opt-in auth feature flags. `appendPkceFlowIdToRedirects` makes the PKCE
   * flow id travel through the OAuth redirect (`sb_flow_id`) so the callback
   * can select the verifier of *that* flow. Without it every flow falls back to
   * the shared legacy key, which mirrors only the most recently started flow —
   * so two flows in flight (e.g. Google, then LinkedIn) collide and the
   * exchange fails with `bad_code_verifier`.
   */
  experimental?: {
    appendPkceFlowIdToRedirects?: boolean;
  };
};

export async function createSupabaseServerClient(
  options: SupabaseServerOptions = {},
) {
  const { url: supabaseUrl, key: supabaseKey } = getSupabaseEnv();

  const cookieStore = await cookies();
  const cookieMethods = {
    getAll: () => cookieStore.getAll(),
    ...(options.allowCookieWrites
      ? {
          setAll: (
            cookiesToSet: {
              name: string;
              value: string;
              options: Exclude<Parameters<typeof cookieStore.set>[2], undefined>;
            }[],
          ) => {
            for (const { name, value, options: cookieOptions } of cookiesToSet) {
              cookieStore.set(name, value, cookieOptions);
            }
          },
        }
      : {}),
  };

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    // The session cookie is the whole session. `@supabase/ssr` defaults to
    // `httpOnly: false` and never sets `Secure`; the app has no browser Supabase
    // client, so nothing needs to read it from JavaScript and HttpOnly can be
    // turned on. `secure` stays conditional so local HTTP dev keeps working.
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    },
    cookies: cookieMethods,
    ...(options.experimental
      ? { auth: { experimental: options.experimental } }
      : {}),
  });
}
