import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import type { Database } from "@/types/database";
import { isCorruptedSupabaseAuthError } from "@/server/auth/supabase-guards";
import {
  isAllowedMailIngressRequest,
  isMailIngressHost,
} from "@/server/email/mail-ingress-host";

const handleI18nRouting = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // The DNS-only mail-ingress hostname bypasses Cloudflare by design so
  // authenticated GitHub cron callbacks are not challenged. Keep that alternate origin narrow:
  // only the authenticated server-to-server POST routes may reach handlers.
  // This host-specific matcher also runs for /api and static paths, unlike the
  // normal application matcher below.
  if (isMailIngressHost(request.nextUrl.hostname)) {
    if (!isAllowedMailIngressRequest(request.method, pathname)) {
      return new NextResponse(null, {
        status: 404,
        headers: {
          "Cache-Control": "private, no-store, max-age=0, must-revalidate",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    return NextResponse.next();
  }

  // Next's route resolver can throw before a handler gets control when an API
  // separator is percent-encoded. Catch only that malformed API shape here.
  if (pathname.toLowerCase().startsWith("/api%2f")) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    });
  }

  const pathnameLocale = pathname.split("/")[1];

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
    // Same hardening as the server client: the session cookie must not be
    // readable by injected JavaScript, and must be Secure in production.
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    },
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
  matcher: [
    "/((?!api(?!%2[fF])|trpc|_next|_vercel|.*\\..*).*)",
    {
      source: "/:path*",
      locale: false,
      has: [{ type: "host", value: "^hooks\\.isbulkktc\\.com\\.?$" }],
    },
  ],
};
