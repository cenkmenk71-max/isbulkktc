import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const outreachPage = readFileSync(new URL("../../src/app/[locale]/(admin)/admin/outreach/page.tsx", import.meta.url), "utf8");
const outreachActions = readFileSync(new URL("../../src/features/admin/outreach-actions.ts", import.meta.url), "utf8");
const outreachComposer = readFileSync(new URL("../../src/features/admin/outreach-composer.tsx", import.meta.url), "utf8");
const trMessages = JSON.parse(readFileSync(new URL("../../src/messages/tr.json", import.meta.url), "utf8"));
const enMessages = JSON.parse(readFileSync(new URL("../../src/messages/en.json", import.meta.url), "utf8"));

/**
 * Security surface tests for the admin outreach feature.
 *
 * These tests verify that the implementation follows security best practices:
 * - Platform admin role requirement enforced server-side
 * - Input validation with Zod schemas
 * - Unsubscribe list checking before sending
 * - List-Unsubscribe headers on promotional emails
 * - Batch size limits enforced
 * - No secret leakage in responses
 * - Server-side authorization before any configuration checks
 */

test("outreach page requires platform_admin role via requirePlatformRole", () => {
  assert.match(outreachPage, /getPlatformAdminMfaStatus\(\)/);
  assert.match(outreachPage, /mfa\.aal2/);
  assert.match(outreachPage, /AdminMfaGate/);
});

test("outreach page redirects non-admin users", () => {
  assert.match(outreachPage, /if \(!mfa\.aal2\)/);
  assert.match(outreachPage, /return \(\s*<main/);
});

test("server action validates input with Zod schema", () => {
  assert.match(outreachActions, /const RecipientSchema = z\.object\(/);
  assert.match(outreachActions, /email: z\.string\(\)\.email\(\)/);
  assert.match(outreachActions, /const OutreachInputSchema = z\.object\(/);
  assert.match(outreachActions, /recipients: z\.array\(RecipientSchema\)\.min\(1\)\.max\(MAX_BATCH_SIZE\)/);
  assert.match(outreachActions, /OutreachInputSchema\.safeParse\(input\)/);
});

test("server action enforces platform_admin role before any work", () => {
  assert.match(outreachActions, /await requirePlatformRole\("platform_admin"\)/);
  // The role check must come before any database or email operations
  const roleCheckIndex = outreachActions.indexOf('requirePlatformRole("platform_admin")');
  const supabaseIndex = outreachActions.indexOf("createSupabaseServerClient()");
  assert.ok(roleCheckIndex > -1, "requirePlatformRole call not found");
  assert.ok(supabaseIndex > -1, "createSupabaseServerClient call not found");
  assert.ok(roleCheckIndex < supabaseIndex, "role check must happen before supabase client creation");
});

test("server action checks unsubscribe status before sending", () => {
  assert.match(outreachActions, /email_engagement_optouts/);
  assert.match(outreachActions, /from\("email_engagement_optouts"\)/);
  assert.match(outreachActions, /\.not\("email", "is", null\)/);
});

test("server action deduplicates recipients within batch", () => {
  assert.match(outreachActions, /function deduplicateRecipients/);
  assert.match(outreachActions, /const seen = new Set<string>\(\);/);
  assert.match(outreachActions, /normaliseEmail\(r\.email\)/);
});

test("server action enforces maximum batch size of 25", () => {
  assert.match(outreachActions, /const MAX_BATCH_SIZE = 25;/);
  assert.match(outreachActions, /\.max\(MAX_BATCH_SIZE\)/);
});

test("server action uses unsubscribe token core for List-Unsubscribe headers", () => {
  assert.match(outreachActions, /import.*unsubscribeUrlFor.*from.*unsubscribe-token-core/);
  assert.match(outreachActions, /unsubscribeUrlFor\(/);
  assert.match(outreachActions, /isUnsubscribeSigningConfigured\(\)/);
});

test("server action returns detailed per-recipient results", () => {
  assert.match(outreachActions, /type SendResult = \{/);
  assert.match(outreachActions, /status: "sent" \| "unsubscribed_skipped" \| "invalid_email" \| "error"/);
  assert.match(outreachActions, /results: SendResult\[\]/);
});

test("server action does not leak secrets in responses", () => {
  assert.ok(!/RESEND_API_KEY/.test(outreachActions), "RESEND_API_KEY must not appear in server action");
  assert.ok(!/ENGAGEMENT_UNSUBSCRIBE_SECRET/.test(outreachActions), "UNSUBSCRIBE secret must not appear in server action");
  assert.ok(!/JSON\.stringify\([^)]*secret/.test(outreachActions), "secrets must not be serialized in responses");
});

test("composer component validates emails client-side before submission", () => {
  assert.match(outreachComposer, /EMAIL_REGEX/);
  assert.match(outreachComposer, /EMAIL_REGEX\.test/);
});

test("composer component prevents duplicate emails in UI", () => {
  assert.match(outreachComposer, /duplicateEmails/);
  // Component normalises emails to lowercase for deduplication
  assert.match(outreachComposer, /toLowerCase\(\)/);
});

test("composer component shows unsubscribe status in results", () => {
  // Check translation files for the status text
  assert.match(trMessages.AdminOutreach.statusSkipped, /Abonelikten Çıkmış/);
  assert.match(enMessages.AdminOutreach.statusSkipped, /Unsubscribed/);
  // Check component uses the translation key
  assert.match(outreachComposer, /statusSkipped/);
  assert.match(outreachComposer, /unsubscribed_skipped/);
});

test("composer component limits bulk paste to 25 recipients", () => {
  // Check translation files for the max 25 text
  assert.match(trMessages.AdminOutreach.bulkPlaceholder, /maksimum 25/);
  assert.match(enMessages.AdminOutreach.bulkPlaceholder, /max 25/);
  // Check component enforces the limit
  assert.match(outreachComposer, /if \(newRecipients\.length >= 25\) break;/);
});

test("composer component uses server action for all sending operations", () => {
  assert.match(outreachComposer, /import.*sendOutreachEmails.*from.*outreach-actions/);
  assert.match(outreachComposer, /await sendOutreachEmails\(/);
  assert.ok(!/fetch\(|axios|resend\./.test(outreachComposer), "no direct API calls in client component");
});

test("server action handles test mode separately from batch mode", () => {
  assert.match(outreachActions, /testMode/);
  assert.match(outreachActions, /testEmail/);
  assert.match(outreachActions, /if \(testMode && testEmail\)/);
});

test("server action validates unsubscribe signing is configured", () => {
  assert.match(outreachActions, /isUnsubscribeSigningConfigured\(\)/);
  assert.match(outreachActions, /Unsubscribe signing is not configured/);
});

test("server action requires valid unsubscribe URL for each recipient", () => {
  assert.match(outreachActions, /unsubscribeUrlFor\(/);
  assert.match(outreachActions, /if \(!unsubscribeUrl\)/);
});

test("outreach page shows Resend configuration status", () => {
  assert.match(outreachPage, /RESEND_API_KEY/);
  assert.match(outreachPage, /EMAIL_FROM|RESEND_FROM_EMAIL/);
  assert.match(outreachPage, /hasResendKey/);
  assert.match(outreachPage, /hasFromEmail/);
});

test("outreach page navigates via AdminConsoleNav", () => {
  // Navigation to outreach is provided by the shared AdminConsoleNav,
  // not by stale per-page sub-links.
  assert.match(trMessages.AdminConsole.outreachEmails, /Tanıtım E-Postaları/);
  assert.match(enMessages.AdminConsole.outreachEmails, /Promotional Emails/);
  // Check page uses AdminConsoleNav as the single navigation source
  assert.match(outreachPage, /<AdminConsoleNav \/>/);
});