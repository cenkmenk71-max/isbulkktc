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
//    Marked `todo` because the fix belongs to LANE-AUTH, not this layer. It
//    starts passing on its own once both `createServerClient` call sites pass
//    `cookieOptions: { httpOnly: true, secure: … }` (or the proxy adds the flags
//    as it forwards the cookies), at which point the `todo` can be dropped.
// ---------------------------------------------------------------------------

const sessionClientFiles = ["src/proxy.ts", "src/server/db/supabase-server.ts"];

test(
  "the Supabase session cookie is HttpOnly and Secure",
  { todo: "session cookie keeps @supabase/ssr defaults (httpOnly:false, no Secure) — LANE-AUTH" },
  () => {
    const offenders: string[] = [];
    for (const file of sessionClientFiles) {
      const source = read(new URL(`../../${file}`, import.meta.url).pathname);
      // The override has to reach `createServerClient`; a flag set anywhere else
      // (e.g. only on the OAuth-intent cookie) does not cover the session cookie.
      const call = source.match(/createServerClient<[\s\S]*?\);/);
      const block = call ? call[0] : source;
      const hardened = /cookieOptions\s*:\s*\{[^}]*httpOnly\s*:\s*true[^}]*\}/.test(block);
      const secure =
        /cookieOptions\s*:\s*\{[^}]*secure\s*:\s*(true|process\.env\.NODE_ENV\s*===\s*["']production["'])/.test(
          block,
        );
      if (!hardened || !secure) {
        offenders.push(`${file} [httpOnly:${hardened} secure:${secure}]`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `session cookies without HttpOnly/Secure: ${offenders.join(", ")}`,
    );
  },
);
