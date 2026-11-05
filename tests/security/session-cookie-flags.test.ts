import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

/**
 * Session-cookie hardening for the Supabase auth cookie.
 *
 * The whole app authenticates through one cookie pair set by `@supabase/ssr`
 * (`createServerClient` in `src/proxy.ts` and `src/server/db/supabase-server.ts`).
 * That library's default cookie options are `{ path: "/", sameSite: "lax",
 * httpOnly: false, maxAge: 400 days }` and it never sets `Secure` (verified in
 * `node_modules/@supabase/ssr/dist/main/utils/constants.js` for the installed
 * version). Both call sites pass no `cookieOptions` override, so the session
 * cookie inherits those defaults.
 *
 * Why `httpOnly: false` is safe to drop here: nothing in the browser reads the
 * session cookie. There is no `createBrowserClient` (the app talks to Supabase
 * only from server code), and the only `document.cookie` writes are for the
 * consent flag, which is a separate cookie. So the cookie can be `HttpOnly`
 * without breaking any client flow — and an `HttpOnly` cookie cannot be read by
 * injected JavaScript, which removes a straightforward XSS→session-theft path.
 *
 * The missing `Secure` flag is the narrower gap: in production the origin is
 * HTTPS-only (HSTS `includeSubDomains; preload`), so the cookie is not exposed
 * on the wire today, but the flag is defence in depth and required by several
 * audits. Local HTTP dev needs `secure` conditional on `NODE_ENV`, exactly like
 * the OAuth-intent cookie in `src/features/identity/actions.ts`.
 *
 * Owner: LANE-AUTH (`src/features/identity/**`, "oturum akışı … güvenlik"). The
 * call sites live in `src/proxy.ts` and `src/server/db/supabase-server.ts`,
 * which the ownership table does not assign to any lane; the session-lifecycle
 * authority is LANE-AUTH, so the handoff goes there. See `docs/threat-model.md`.
 */

const srcDir = new URL("../../src/", import.meta.url);

function walk(directory: URL): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const path = new URL(entry, directory);
    if (statSync(path).isDirectory()) files.push(...walk(new URL(`${entry}/`, directory)));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(path.pathname);
  }
  return files;
}

const sourceFiles = walk(srcDir);

function relative(path: string): string {
  return path.slice(path.indexOf("/src/") + 1);
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

// ---------------------------------------------------------------------------
// 1. Nothing in the browser needs the session cookie, so `HttpOnly` is safe.
//    This is the premise that makes finding #1 a real fix rather than a break.
// ---------------------------------------------------------------------------

test("no client module creates a browser Supabase client", () => {
  const offenders = sourceFiles
    .filter((path) => /createBrowserClient/.test(read(path)))
    .map(relative);
  assert.deepEqual(
    offenders,
    [],
    `a browser Supabase client would need the session cookie to stay readable: ${offenders.join(", ")}`,
  );
});

// ---------------------------------------------------------------------------
// 2. The proxy verifies the session instead of trusting the cookie.
//    `getClaims()` re-validates the JWT signature; `getSession()` reads the
//    cookie without re-checking it (Supabase's own SSR guide says never to trust
//    it in server code). This is a positive control worth pinning.
// ---------------------------------------------------------------------------

test("the proxy verifies claims rather than trusting the raw session", () => {
  const proxy = read(sourceFiles.find((path) => path.endsWith("/src/proxy.ts"))!);
  assert.match(proxy, /auth\.getClaims\(\)/, "the proxy must verify the token with getClaims()");
  assert.ok(
    !/auth\.getSession\(\)/.test(proxy),
    "the proxy must not read the unverified session with getSession()",
  );
});

// ---------------------------------------------------------------------------
// 3. The session cookie is hardened.
//
//    LANE-AUTH shipped the fix (#201): both `createServerClient` call sites now
//    pass `cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV ===
//    "production" }`. The check below used to carry a `todo` while the gap was
//    open; it is a gate now, so a regression re-opening the cookie fails CI.
// ---------------------------------------------------------------------------

const sessionClientFiles = ["src/proxy.ts", "src/server/db/supabase-server.ts"];

/**
 * The flags have to reach the Supabase client that writes the session cookie.
 * Both call sites create exactly one such client, and the only reason to set
 * `cookieOptions` in either file is to harden it, so the whole file is
 * inspected. (An earlier version matched `/createServerClient<[\s\S]*?\);/`,
 * which captured only the client's `setAll` callback body — the flags live in
 * the third argument, so the match would have reported a false negative even
 * after the fix landed.)
 *
 * `sameSite` is checked too: `@supabase/ssr` defaults it to `"lax"` (see
 * `node_modules/@supabase/ssr/dist/main/utils/constants.js`), which is what keeps
 * the session cookie from riding a cross-site request. Weakening it to `"none"`
 * removes that CSRF defence and re-enables cross-site cookie sending, and the
 * earlier version of this check did not look at it — so `sameSite: "none"` passed
 * every gate. It is now part of the contract.
 */
function isHardened(source: string): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: boolean;
} {
  const options = source.match(/cookieOptions\s*:\s*\{([\s\S]*?)\}/);
  const block = options ? options[1] : "";
  return {
    httpOnly: /httpOnly\s*:\s*true/.test(block),
    secure:
      /secure\s*:\s*(true|process\.env\.NODE_ENV\s*===\s*["']production["'])/.test(
        block,
      ),
    // `lax` or `strict` keep the cookie off cross-site requests; `none` (or an
    // absent value) does not.
    sameSite: /sameSite\s*:\s*["'](?:lax|strict)["']/.test(block),
  };
}

test("the Supabase session cookie is HttpOnly, Secure and SameSite", () => {
  const offenders: string[] = [];
  for (const file of sessionClientFiles) {
    const source = read(new URL(`../../${file}`, import.meta.url).pathname);
    const { httpOnly, secure, sameSite } = isHardened(source);
    if (!httpOnly || !secure || !sameSite) {
      offenders.push(`${file} [httpOnly:${httpOnly} secure:${secure} sameSite:${sameSite}]`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `session cookies without HttpOnly/Secure/SameSite: ${offenders.join(", ")}`,
  );
});

test("the cookie-flag check detects a hardened call site (self-test)", () => {
  // Guards the guard: if `isHardened` ever regresses to inspecting the wrong
  // substring, the gate above would pass for the wrong reason. This proves it
  // recognises a correctly hardened block and rejects a half-hardened one.
  assert.deepEqual(
    isHardened("cookieOptions: { sameSite: 'lax', httpOnly: true, secure: true }"),
    { httpOnly: true, secure: true, sameSite: true },
  );
  assert.deepEqual(
    isHardened(
      "cookieOptions: { sameSite: 'strict', httpOnly: true, secure: process.env.NODE_ENV === 'production' }",
    ),
    { httpOnly: true, secure: true, sameSite: true },
  );
  assert.deepEqual(isHardened("cookieOptions: { httpOnly: false }"), {
    httpOnly: false,
    secure: false,
    sameSite: false,
  });
  // `sameSite: "none"` is not a hardened value, even with HttpOnly/Secure set.
  assert.deepEqual(
    isHardened("cookieOptions: { sameSite: 'none', httpOnly: true, secure: true }"),
    { httpOnly: true, secure: true, sameSite: false },
  );
});

// ---------------------------------------------------------------------------
// 4. The OAuth sign-up intent cookie carries the same flags.
//
// It is set from a server action (`startOAuthSignIn`) on the same response as the
// session, and it carries the locale/audience the callback trusts. It is not the
// session cookie, so the `createServerClient` check above does not see it; a
// regression that dropped `httpOnly` or `sameSite` here would leave a cookie the
// callback reads unprotected.
// ---------------------------------------------------------------------------

test("the OAuth sign-up intent cookie is HttpOnly, Secure and SameSite", () => {
  const source = read(
    new URL("../../src/features/identity/actions.ts", import.meta.url).pathname,
  );
  const setCall = source.match(
    /cookieStore\.set\(\s*oauthSignupIntentCookieName[\s\S]*?\{([\s\S]*?)\}\s*,?\s*\);/,
  );
  assert.ok(setCall, "the OAuth sign-up intent cookie is no longer set explicitly");
  const block = setCall![1];
  assert.match(block, /httpOnly\s*:\s*true/, "the intent cookie must be HttpOnly");
  assert.match(
    block,
    /sameSite\s*:\s*["'](?:lax|strict)["']/,
    "the intent cookie must keep a SameSite of lax or strict",
  );
  assert.match(
    block,
    /secure\s*:\s*(true|process\.env\.NODE_ENV\s*===\s*["']production["'])/,
    "the intent cookie must set Secure in production",
  );
});
