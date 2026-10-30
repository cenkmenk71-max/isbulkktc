"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Browser Supabase client, created once per tab and reused.
 *
 * The header needs the session to choose between its guest and signed-in
 * actions, and the root locale layout is statically generated, so the session
 * cannot be read on the server without opting the whole site out of static
 * rendering. Reading it here keeps every page statically served and lets the
 * header correct itself after hydration.
 *
 * Returns null when the public Supabase env is absent (e.g. a bare local run),
 * so callers degrade to the guest actions instead of throwing.
 */
export function getSupabaseBrowserClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client = createBrowserClient<Database>(url, key);
  return client;
}
