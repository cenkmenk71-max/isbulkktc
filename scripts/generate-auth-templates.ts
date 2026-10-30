/**
 * Regenerates the GoTrue auth email templates in `supabase/templates/` from the
 * shared branded layout, so the four Supabase auth emails can never drift from
 * the app's transactional emails.
 *
 * GoTrue resolves `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .Token }}` and
 * `{{ .SiteURL }}` inside the HTML. The renderer escapes and URL-validates its
 * inputs, so this script renders with sentinel values and swaps them for the
 * GoTrue placeholders afterwards.
 *
 * Usage: npx tsx scripts/generate-auth-templates.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderAuthConfirmation,
  renderAuthPasswordChanged,
  renderAuthReauthentication,
  renderAuthRecovery,
} from "../supabase/functions/_shared/email-render.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "supabase/templates");

const CONFIRM_SENTINEL = "https://isbulkktc.com/__GOTRUE_CONFIRM__";
const SITE_SENTINEL = "https://isbulkktc.com/__GOTRUE_SITE__";
const EMAIL_SENTINEL = "__GOTRUE_EMAIL__";

function toGoTrue(html: string): string {
  return html
    .replaceAll(CONFIRM_SENTINEL, "{{ .ConfirmationURL }}")
    .replaceAll(SITE_SENTINEL, "{{ .SiteURL }}")
    .replaceAll(EMAIL_SENTINEL, "{{ .Email }}");
}

const ctx = { locale: "tr", siteUrl: SITE_SENTINEL } as const;

const files: Record<string, string> = {
  "confirmation.html": renderAuthConfirmation({
    ...ctx,
    email: EMAIL_SENTINEL,
    confirmationUrl: CONFIRM_SENTINEL,
  }).html,
  "recovery.html": renderAuthRecovery({
    ...ctx,
    email: EMAIL_SENTINEL,
    confirmationUrl: CONFIRM_SENTINEL,
  }).html,
  "reauthentication.html": renderAuthReauthentication({
    ...ctx,
    token: "{{ .Token }}",
  }).html,
  "password-changed.html": renderAuthPasswordChanged({
    ...ctx,
    email: EMAIL_SENTINEL,
  }).html,
};

mkdirSync(outDir, { recursive: true });
for (const [name, html] of Object.entries(files)) {
  const output = toGoTrue(html);
  writeFileSync(resolve(outDir, name), output, "utf8");
  console.log(`wrote supabase/templates/${name} (${output.length} bytes)`);
}
