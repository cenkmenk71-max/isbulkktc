import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * The two deliberately-anonymous write paths: `submit_feedback` and
 * `submit_sales_lead`.
 *
 * Both are granted to `anon` on purpose — a visitor must be able to leave
 * feedback or request a quote without an account — and both fan out to outbound
 * email: `submitFeedback` mails the submitted address a receipt and the team a
 * copy, and `submitSalesLead` does the same for a lead. That combination is the
 * classic anonymous-mail vector, so this suite records the *structure* (who can
 * call what) and asserts the control the forms carry.
 *
 * The actions were originally unprotected. They now throttle per client address
 * and per submitted address (`src/features/abuse/**`), which is what the third
 * test pins. That closes the form-level vector — a scripted caller driving
 * `POST /contact` is bounded. It does **not** close the endpoint: the same RPCs
 * are directly callable with the publishable key, above the limiter. That
 * residual gap is tracked in `anonymous-rpc-throttle.test.ts`.
 */

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
const featuresDir = new URL("../../src/features/", import.meta.url);

function allSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(new URL(name, migrationsDir), "utf8"))
    .join("\n");
}

const sql = allSql();

test("the anonymous write RPCs are granted to anon (by design)", () => {
  for (const signature of [
    "submit_feedback(text, text, text, integer, text, text)",
    "submit_sales_lead(text, text, text, text, text, integer, text, text)",
  ]) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${escaped.replace(/\s+/g, "\\s+")}\\s+to[^;]*\\banon\\b`,
      "i",
    );
    assert.match(sql, pattern, `${signature} is not granted to anon`);
  }
});

/**
 * The body of the last `create [or replace] function public.<name>(…)` in the
 * migration set — the definition that actually wins, since every migration is
 * replayed in order.
 */
function latestFunctionBody(name: string): string | null {
  const re = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\)\\s*[\\s\\S]*?\\bas\\s+\\$[A-Za-z_0-9]*\\$([\\s\\S]*?)\\$[A-Za-z_0-9]*\\$`,
    "gi",
  );
  const matches = [...sql.matchAll(re)];
  return matches.length > 0 ? matches[matches.length - 1][1] : null;
}

/**
 * Every table an `anon`-granted function inserts into, **discovered** from the
 * grant statements and the winning function bodies — not listed by hand.
 *
 * The earlier version hard-coded `["feedback_submissions", "sales_leads"]`. That
 * is a false negative by construction: a third anon write RPC (a new contact
 * form, a live-support message) would insert into a table this check never
 * inspects, so a table left readable by `anon`/`authenticated` would ship green.
 * Discovery closes that hole; the self-test below proves the scan finds the two
 * reviewed tables.
 *
 * Over-approximation is deliberate and safe: a function whose grant was later
 * revoked is still scanned, and its table is still asserted revoked — which is
 * the correct end state for a table an anonymous writer ever touched.
 */
function anonymousWriteTables(): string[] {
  const tables = new Set<string>();
  for (const match of sql.matchAll(
    /grant\s+execute\s+on\s+function\s+(?:public\.)?([a-z_0-9]+)\s*\([^)]*\)\s*to[^;]*\banon\b/gi,
  )) {
    const body = latestFunctionBody(match[1]);
    if (!body) continue;
    for (const insert of body.matchAll(/insert\s+into\s+public\.([a-z_0-9]+)/gi)) {
      tables.add(insert[1]);
    }
  }
  return [...tables].sort();
}

/** The two reviewed anon write RPCs — the discovery must always find these. */
const reviewedAnonymousWriteRpcs = [
  "submit_feedback",
  "submit_sales_lead",
];

test("the anonymous write RPCs are not readable by clients", () => {
  // The tables are service-role-only; the RPC returns the new id and nothing else.
  const tables = anonymousWriteTables();
  assert.deepEqual(
    tables,
    ["feedback_submissions", "sales_leads"],
    "the discovered anon-write table set drifted from the reviewed two",
  );
  for (const table of tables) {
    const pattern = new RegExp(
      `revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public,\\s*anon,\\s*authenticated`,
      "i",
    );
    assert.match(sql, pattern, `public.${table} is not revoked from client roles`);
  }
});

test("the anon-write table discovery sees the two reviewed RPCs (self-test)", () => {
  // Guards the guard: a scan that silently stops finding the reviewed writers
  // would make the gate above pass vacuously. Both must be discovered, and a
  // read-only public RPC must not drag its table in.
  const discovered = anonymousWriteTables();
  for (const table of ["feedback_submissions", "sales_leads"]) {
    assert.ok(discovered.includes(table), `${table} was not discovered: ${discovered.join(", ")}`);
  }
  for (const name of reviewedAnonymousWriteRpcs) {
    assert.ok(latestFunctionBody(name) !== null, `${name} no longer has a discoverable definition`);
  }
  assert.ok(
    !discovered.some((table) => /^(jobs|companies|job_source_imports)$/.test(table)),
    "a read-only public RPC's table was misclassified as an anon write target",
  );
});

test("the anonymous mail-sending forms carry an abuse control", () => {
  // The actions throttle per client address and per submitted address before the
  // RPC and the mail it triggers. This is a gate, not a `todo`: it was promoted
  // once `src/features/abuse/**` shipped. The *endpoint* is still open — see
  // `anonymous-rpc-throttle.test.ts` — but the form itself must stay protected.
  //
  // The forms are *discovered* by their RPC call rather than listed by name: a
  // third action that calls an anonymous mail-sending RPC (a new contact form)
  // must carry the control too, and a hand-written pair would never check it.
  const forms = (readdirSync(featuresDir, { recursive: true }) as string[])
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
    .sort()
    .map((entry) => ({
      file: `src/features/${entry}`,
      source: readFileSync(new URL(entry, featuresDir), "utf8"),
    }))
    .filter(({ source }) =>
      /\.rpc\(\s*"(?:submit_feedback|submit_sales_lead)"\s*[,)]/.test(source),
    );

  assert.ok(
    forms.length >= 2,
    `expected to discover the feedback and sales forms, found ${forms.length}`,
  );

  for (const { file, source } of forms) {
    const hasCaptcha = /captcha|turnstile/i.test(source);
    const hasRateLimit = /rate.?limit|throttle/i.test(source);
    assert.ok(hasCaptcha || hasRateLimit, `${file} has neither captcha nor rate limiting`);
  }
});
