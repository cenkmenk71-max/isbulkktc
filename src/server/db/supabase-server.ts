import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

type SupabaseServerOptions = {
  allowCookieWrites?: boolean;
};

export async function createSupabaseServerClient(
  options: SupabaseServerOptions = {},
) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-isbulkktc.supabase.co";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder";

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
    cookies: cookieMethods,
  });
}
