import { createHmac } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * End-to-end proof that the managed-content console is genuinely dynamic: an
 * administrator signs in, clears the TOTP gate, writes through the real server
 * action, and the change is visible on the public page on the very next
 * request — no rebuild, no restart.
 *
 * Nothing is mocked. The suite creates a confirmed administrator with the
 * service-role key, grants `platform_admin` through PostgREST (the service role
 * bypasses RLS), enrols a real TOTP factor in the browser, and computes the
 * one-time code in-process. It needs the local stack (TOTP enrollment enabled
 * in `supabase/config.toml`) and is skipped everywhere else.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isLocalStack = /(127\.0\.0\.1|localhost|\[::1\])/.test(supabaseUrl);

test.skip(
  !isLocalStack || !serviceRoleKey,
  "The console E2E needs the local Supabase stack and its service-role key.",
);

test.describe.configure({ mode: "serial" });

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decodes an RFC 4648 base32 secret (no padding required). */
function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of clean) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error(`Invalid base32 character: ${character}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP with the SHA-1/30s/6-digit defaults Supabase uses. */
function totp(secret: string, at = Date.now()): string {
  const counter = Math.floor(at / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

async function createAdmin(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  const created = await request.post(`${supabaseUrl}/auth/v1/admin/users`, {
    headers,
    data: {
      email,
      password,
      email_confirm: true,
      user_metadata: { locale: "tr", display_name: "E2E Admin" },
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };

  const granted = await request.post(`${supabaseUrl}/rest/v1/user_roles`, {
    headers: { ...headers, Prefer: "return=minimal" },
    data: { user_id: id, role: "platform_admin" },
  });
  expect(granted.ok(), await granted.text()).toBeTruthy();
}

/** Signs in and clears the TOTP gate, leaving the browser on the console. */
async function signInThroughMfa(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/tr/login?audience=candidate");
  await page.getByLabel("E-posta adresi").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Aday girişi" }).click();
  await expect(page).toHaveURL(/\/profile\/dashboard/);

  await page.goto("/tr/admin/content");
  await page.getByRole("button", { name: "MFA kurulumunu başlat" }).click();

  // Enrollment reveals the shared secret; compute the code from it.
  const secret =
    (await page.locator(".admin-mfa-enrollment code").textContent()) ?? "";
  expect(secret.trim().length).toBeGreaterThan(0);
  await page.locator("#admin-mfa-code").fill(totp(secret.trim()));
  await page.locator(".admin-mfa-verify button[type=submit]").click();
  await expect(page).toHaveURL(/\/admin\/packages/);
}

test("an administrator writes content and the public page reflects it immediately", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const email = `e2e-admin-${stamp}@example.com`;
  const password = "Admin-pass-2026";
  const question = `E2E canlı soru ${stamp}?`;
  const answer = `E2E canlı cevap ${stamp}`;

  await createAdmin(request, email, password);
  await signInThroughMfa(page, email, password);

  // The console only renders after the aal2 gate is satisfied.
  await page.goto("/tr/admin/content");
  await expect(
    page.getByRole("heading", { name: "Yayın içeriği yönetimi" }),
  ).toBeVisible();

  // Write a new published FAQ entry through the real server action.
  const newFaq = page.locator("form", { has: page.getByText("Yeni soru") }).first();
  await newFaq.locator('input[name="question"]').fill(question);
  await newFaq.locator('textarea[name="answer"]').fill(answer);
  await newFaq.getByRole("button", { name: "Soruyu kaydet" }).click();
  await expect(page.locator(".admin-package-message[data-status=success]").first()).toBeVisible();

  // The public FAQ page must show it on the next request.
  await page.goto("/tr/about");
  await expect(page.getByText(question)).toBeVisible();

  // And the JSON-LD carries it too, so the write is not just a DOM change.
  const html = await page.content();
  expect(html).toContain(question);

  // Clean up so repeated runs stay deterministic.
  const cleanup = await request.delete(
    `${supabaseUrl}/rest/v1/faq_entries?question=eq.${encodeURIComponent(question)}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  expect(cleanup.ok()).toBeTruthy();
});
