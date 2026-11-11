"use client";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Publishable-key browser client.
 *
 * Only `NEXT_PUBLIC_*` values are read, so nothing here can ship a secret into
 * the bundle. It is used by surfaces that call a deliberately anonymous RPC
 * straight from the visitor's browser — currently the live-support widget
 * (`submit_support_message`). The write path stays abuse-bounded on the database
 * side: the RPC consumes the `anon` write quota keyed on the app-forwarded
 * visitor address (the `src/features/abuse/limits.ts` limiter mirrors that
 * budget at the form layer), so this client needs no throttle state of its own.
 */
export function createSupabaseBrowserClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://placeholder-isbulkktc.supabase.co";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder";

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
