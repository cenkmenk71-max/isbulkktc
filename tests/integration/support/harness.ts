/**
 * Integration-test harness: the external boundary, faked; everything above it, real.
 *
 * The layer this file supports sits between `tests/unit/**` (pure functions) and
 * `tests/e2e/**` (a browser). It exercises the *real* server action, the *real*
 * data-access layer, the *real* Zod schemas and the *real* authorization helpers,
 * and replaces only the process edges they cannot run without:
 *
 *   - `server-only` is a marker package that throws on import; here it is a no-op
 *     (there is no bundler to select its `react-server` export);
 *   - `next/headers`, `next/cache` and `next/navigation` need a live Next.js
 *     request context, so they are replaced with recorders;
 *   - `@/server/db/supabase-server` is the network edge (PostgREST + GoTrue);
 *     a fake client stands in for it, and every call is recorded;
 *   - `@/server/email/mailer` is the Resend edge, likewise recorded.
 *
 * Everything else — `getCurrentUser`, `requirePlatformRole`, `isJobCompanyMember`,
 * the action bodies, the schemas — runs as written. That is what makes a failure
 * here meaningful: a missing authorization check, a wrong table, a swallowed
 * error all show up because the code between the action and the fake edge is the
 * production code.
 *
 * Requires Node's experimental module mocking, which the `node:test` runner only
 * exposes behind a flag. The layer therefore runs with:
 *
 *     tsx --experimental-test-module-mocks --test "tests/integration/**\/*.test.ts"
 *
 * `package.json` (LANE-INFRA) must add that script and a CI step for the layer to
 * be a gate; until then it is a documented, runnable suite. See the README.
 */

import { mock } from "node:test";

// ---------------------------------------------------------------------------
// Recorded boundary calls
// ---------------------------------------------------------------------------

export type SupabaseCall =
  | { kind: "from"; table: string; ops: string[] }
  | { kind: "rpc"; name: string; args: Record<string, unknown> }
  | { kind: "auth"; method: string };

export type MailCall = { template: string; payload: Record<string, unknown> };

export type Recorded = {
  supabase: SupabaseCall[];
  mail: MailCall[];
  revalidated: string[];
  revalidatedTags: string[];
  redirects: string[];
};

/** A `redirect()` never returns; it unwinds the action. Tests catch this. */
export class RedirectSignal extends Error {
  constructor(readonly destination: string) {
    super(`REDIRECT:${destination}`);
    this.name = "RedirectSignal";
  }
}

export function isRedirect(error: unknown): error is RedirectSignal {
  return error instanceof RedirectSignal;
}

// ---------------------------------------------------------------------------
// Fake Supabase (the network edge)
// ---------------------------------------------------------------------------

type QueryResult = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

export type TableOutcome = QueryResult | ((ops: string[]) => QueryResult);
export type RpcOutcome = QueryResult | ((args: Record<string, unknown>) => QueryResult);

export type FakeSupabaseScript = {
  /** Result for `from(table)`. Missing table -> `{ data: null, error: null }`. */
  tables?: Record<string, TableOutcome>;
  /** Result for `rpc(name, args)`. Missing rpc -> `{ data: null, error: null }`. */
  rpcs?: Record<string, RpcOutcome>;
  /** `auth.getUser()` result; `undefined` means "no session". */
  user?: unknown;
  /** Auth methods (`signInWithPassword`, …) return this `error` when set. */
  authError?: { code?: string; message?: string } | null;
};

export class FakeSupabase {
  readonly script: FakeSupabaseScript;

  constructor(script: FakeSupabaseScript = {}) {
    this.script = script;
  }

  from(table: string) {
    const ops: string[] = [];
    const call: SupabaseCall = { kind: "from", table, ops };
    recorded.supabase.push(call);
    let result: QueryResult = { data: null, error: null };

    const settle = (): QueryResult => {
      const outcome = this.script.tables?.[table];
      if (typeof outcome === "function") return outcome(ops);
      return outcome ?? { data: null, error: null };
    };

    const builder = {
      select: (columns?: string, options?: unknown) => {
        ops.push(`select:${columns ?? "*"}${options ? `:${JSON.stringify(options)}` : ""}`);
        return builder;
      },
      insert: (values?: unknown) => {
        ops.push(`insert:${JSON.stringify(values)}`);
        return builder;
      },
      update: (values?: unknown) => {
        ops.push(`update:${JSON.stringify(values)}`);
        return builder;
      },
      upsert: (values?: unknown, options?: unknown) => {
        ops.push(`upsert:${JSON.stringify(values)}:${JSON.stringify(options ?? {})}`);
        return builder;
      },
      delete: () => {
        ops.push("delete");
        return builder;
      },
      eq: (column: string, value: unknown) => {
        ops.push(`eq:${column}=${JSON.stringify(value)}`);
        return builder;
      },
      in: (column: string, values: unknown) => {
        ops.push(`in:${column}=${JSON.stringify(values)}`);
        return builder;
      },
      order: (column: string, options?: unknown) => {
        ops.push(`order:${column}${options ? `:${JSON.stringify(options)}` : ""}`);
        return builder;
      },
      limit: (count: number) => {
        ops.push(`limit:${count}`);
        return builder;
      },
      filter: (column: string, operator: string, value: unknown) => {
        ops.push(`filter:${column}${operator}${JSON.stringify(value)}`);
        return builder;
      },
      maybeSingle: () => Promise.resolve(settle()),
      single: () => Promise.resolve(settle()),
      // Some call sites await the builder itself (`await …insert({…})`), so the
      // fake has to be thenable exactly like the PostgREST builder is.
      then: <TResult1 = QueryResult, TResult2 = never>(
        onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => {
        result = settle();
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  rpc(name: string, args: Record<string, unknown> = {}) {
    recorded.supabase.push({ kind: "rpc", name, args });
    const outcome = this.script.rpcs?.[name];
    const result: QueryResult =
      typeof outcome === "function" ? outcome(args) : outcome ?? { data: null, error: null };
    return Promise.resolve(result);
  }

  auth = {
    getUser: async () => {
      recorded.supabase.push({ kind: "auth", method: "getUser" });
      return this.script.user
        ? { data: { user: this.script.user }, error: null }
        : { data: { user: null }, error: null };
    },
    signInWithPassword: async () => {
      recorded.supabase.push({ kind: "auth", method: "signInWithPassword" });
      return { data: { user: null, session: null }, error: this.script.authError ?? null };
    },
    signUp: async () => {
      recorded.supabase.push({ kind: "auth", method: "signUp" });
      return { data: { user: null, session: null }, error: this.script.authError ?? null };
    },
    resend: async () => {
      recorded.supabase.push({ kind: "auth", method: "resend" });
      return { data: null, error: this.script.authError ?? null };
    },
    resetPasswordForEmail: async () => {
      recorded.supabase.push({ kind: "auth", method: "resetPasswordForEmail" });
      return { data: null, error: this.script.authError ?? null };
    },
    updateUser: async () => {
      recorded.supabase.push({ kind: "auth", method: "updateUser" });
      return { data: { user: null }, error: this.script.authError ?? null };
    },
    signOut: async () => {
      recorded.supabase.push({ kind: "auth", method: "signOut" });
      return { error: this.script.authError ?? null };
    },
    signInWithOAuth: async () => {
      recorded.supabase.push({ kind: "auth", method: "signInWithOAuth" });
      return {
        data: { url: "https://example.invalid/oauth" },
        error: this.script.authError ?? null,
      };
    },
    mfa: {
      getAuthenticatorAssuranceLevel: async () => ({
        data: { currentLevel: "aal1", nextLevel: "aal2" },
        error: null,
      }),
      listFactors: async () => ({ data: { totp: [] }, error: null }),
    },
  };
}

// ---------------------------------------------------------------------------
// The mutable boundary the tests drive
// ---------------------------------------------------------------------------

export const recorded: Recorded = {
  supabase: [],
  mail: [],
  revalidated: [],
  revalidatedTags: [],
  redirects: [],
};

// Reassigned by `resetBoundary`/`setRequestHeaders` below and read by the module
// mocks, so the boundary always sees the current value. Kept private: tests drive
// them through those functions and assert on `recorded`.
let fakeSupabase = new FakeSupabase();
let requestHeaders = new Headers();

export function resetBoundary(script: FakeSupabaseScript = {}): FakeSupabase {
  recorded.supabase.length = 0;
  recorded.mail.length = 0;
  recorded.revalidated.length = 0;
  recorded.revalidatedTags.length = 0;
  recorded.redirects.length = 0;
  mailFailures.clear();
  requestHeaders = new Headers();
  fakeSupabase = new FakeSupabase(script);
  return fakeSupabase;
}

export function setRequestHeaders(headers: Record<string, string>): void {
  requestHeaders = new Headers(headers);
}

/**
 * The auth methods called on the fake GoTrue client, in order. Lets a test prove
 * a credential change actually reached `updateUser` (or that it did not) — the
 * value-only assertion cannot tell "the password was changed" from "the action
 * returned success without touching the password".
 */
export function authMethods(): string[] {
  return recorded.supabase
    .filter((call): call is Extract<SupabaseCall, { kind: "auth" }> => call.kind === "auth")
    .map((call) => call.method);
}

/**
 * Templates whose send must throw, so a test can prove the caller treats mail as
 * best-effort. `"*"` makes every template fail.
 */
export const mailFailures = new Set<string>();

function recordMail(template: string, payload: Record<string, unknown>): void {
  if (mailFailures.has("*") || mailFailures.has(template)) {
    throw new Error(`Simulated ${template} mail failure`);
  }
  recorded.mail.push({ template, payload });
}

// ---------------------------------------------------------------------------
// Module mocks — registered once, before any target module is imported
// ---------------------------------------------------------------------------

export function installBoundaryMocks(): void {
  mock.module("server-only", { namedExports: {} });

  mock.module("next/headers", {
    namedExports: {
      cookies: async () => ({ getAll: () => [], set: () => {}, delete: () => {} }),
      headers: async () => requestHeaders,
    },
  });

  mock.module("next/cache", {
    namedExports: {
      revalidatePath: (path: string) => {
        recorded.revalidated.push(path);
      },
      revalidateTag: (tag: string) => {
        recorded.revalidatedTags.push(tag);
      },
      unstable_cache: <T>(fn: T) => fn,
    },
  });

  mock.module("next/navigation", {
    namedExports: {
      redirect: (destination: string): never => {
        recorded.redirects.push(destination);
        throw new RedirectSignal(destination);
      },
    },
  });

  mock.module("next-intl/server", {
    namedExports: { getLocale: async () => "tr" },
  });

  mock.module("@/server/db/supabase-server", {
    namedExports: {
      createSupabaseServerClient: async () => {
        recorded.supabase.push({ kind: "auth", method: "createClient" });
        return fakeSupabase;
      },
      createSupabasePublicClient: () => fakeSupabase,
      createSupabaseServiceClient: () => null,
    },
  });

  // The Resend edge. The real mailer degrades to a no-op without an API key, but
  // a recorder lets a test assert *that* a receipt was attempted, and lets it
  // force a failure to prove the caller treats mail as best-effort.
  mock.module("@/server/email/mailer", {
    namedExports: {
      sendFeedbackEmails: async (payload: Record<string, unknown>) => recordMail("feedback", payload),
      sendSalesLeadEmails: async (payload: Record<string, unknown>) => recordMail("sales", payload),
      sendResumeReceivedEmail: async (payload: Record<string, unknown>) => recordMail("resume", payload),
      sendWelcomeEmail: async (payload: Record<string, unknown>) => recordMail("welcome", payload),
      sendJobPublishedEmail: async (payload: Record<string, unknown>) => recordMail("jobPublished", payload),
      getFeedbackInbox: () => null,
    },
  });
}

// ---------------------------------------------------------------------------
// Real-user factories
// ---------------------------------------------------------------------------

export type FakeUser = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  app_metadata: Record<string, unknown>;
};

export function fakeAuthUser(overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: "candidate@example.invalid",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] },
    ...overrides,
  };
}

/** The row shape `getCurrentUser` selects from `public.profiles`. */
export function fakeProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    display_name: "Ada Lovelace",
    locale: "tr",
    status: "active",
    avatar_url: null,
    given_name: null,
    family_name: null,
    ...overrides,
  };
}
