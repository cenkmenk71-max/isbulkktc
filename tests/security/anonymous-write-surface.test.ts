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
 * call what) and pins the missing control as an open finding.
 *
 * The auth forms already carry a Cloudflare Turnstile widget; the feedback and
 * sales forms do not, and neither the server actions nor the RPCs rate-limit.
 * A scripted caller can therefore drive `POST /contact` (and the sales form)
 * to send unsolicited mail to an arbitrary address and to flood the team inbox,
 * without ever proving it is a human. The fix — a captcha token and/or a
 * per-IP/per-address throttle — belongs to the owner of
 * `src/features/feedback/**` and `src/features/sales/**`.
 */

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);

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

test(
  "the anonymous mail-sending forms carry an abuse control",
  { todo: "no captcha/rate limit on feedback & sales forms (see docs/threat-model.md)" },
  () => {
    const guards = ["src/features/feedback/actions.ts", "src/features/sales/actions.ts"].map(
      (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8"),
    );

    for (const [index, source] of guards.entries()) {
      const hasCaptcha = /captcha|turnstile/i.test(source);
      const hasRateLimit = /rate.?limit|throttle/i.test(source);
      assert.ok(
        hasCaptcha || hasRateLimit,
        `${["feedback", "sales"][index]} action has neither captcha nor rate limiting`,
      );
    }
  },
);
