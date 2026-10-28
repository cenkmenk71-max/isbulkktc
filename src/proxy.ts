import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import type { Database } from "@/types/database";
import { isCorruptedSupabaseAuthError } from "@/server/auth/supabase-guards";

const handleI18nRouting = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const pathnameLocale = request.nextUrl.pathname.split("/")[1];

  // The default locale has one canonical public URL when localePrefix="as-needed".
  // Do not exempt requests based on x-next-intl-locale: that header can also be
  // present on the incoming prefixed URL and would let /tr/... bypass this redirect.
  if (pathnameLocale === routing.defaultLocale) {
    const url = request.nextUrl.clone();
    const prefix = `/${routing.defaultLocale}`;
    url.pathname = url.pathname.slice(prefix.length) || "/";
    return NextResponse.redirect(url, 308);
  }

  const response = handleI18nRouting(request);
  if (!response.ok) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  let sessionResponse = NextResponse.next({ request });
  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        sessionResponse = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          sessionResponse.cookies.set(name, value, options);
        }

        for (const [name, value] of Object.entries(headers)) {
          sessionResponse.headers.set(name, value);
        }
      },
    },
  });

  try {
    const { error } = await supabase.auth.getClaims();

    if (error) {
      if (isCorruptedSupabaseAuthError(error)) {
        const cookieNames = request.cookies
          .getAll()
          .map((cookie) => cookie.name)
          .filter((name) => /^(sb-|.*(auth|session|supabase)).*$/i.test(name));

        for (const name of cookieNames) {
          request.cookies.delete(name);
          response.cookies.delete(name);
          sessionResponse.cookies.delete(name);
        }

        console.warn(
          "Cleared stale Supabase auth cookies after a JSON parse failure.",
          {
            cookieNames,
          },
        );
        return response;
      }

      console.error("Supabase session refresh failed.", { code: error.code });
    }
  } catch (error) {
    if (isCorruptedSupabaseAuthError(error)) {
      const cookieNames = request.cookies
        .getAll()
        .map((cookie) => cookie.name)
        .filter((name) => /^(sb-|.*(auth|session|supabase)).*$/i.test(name));

      for (const name of cookieNames) {
        request.cookies.delete(name);
        response.cookies.delete(name);
        sessionResponse.cookies.delete(name);
      }

      console.warn(
        "Cleared stale Supabase auth cookies after a thrown JSON parse error.",
        {
          cookieNames,
        },
      );
      return response;
    }

    throw error;
  }

  for (const cookie of sessionResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
