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

test("the anonymous write RPCs are not readable by clients", () => {
  // The tables are service-role-only; the RPC returns the new id and nothing else.
  for (const table of ["feedback_submissions", "sales_leads"]) {
    const pattern = new RegExp(
      `revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public,\\s*anon,\\s*authenticated`,
      "i",
    );
    assert.match(sql, pattern, `public.${table} is not revoked from client roles`);
  }
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
