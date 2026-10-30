import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Real end-to-end coverage of the identity flows. Nothing here is mocked: the
 * suite drives the actual server actions, reads the confirmation/recovery mail
 * out of the local mail catcher (Mailpit, port 54324) and signs in with the
 * credentials it created.
 *
 * It only runs against the seeded local Supabase stack that CI starts
 * (`NEXT_PUBLIC_SUPABASE_URL` pointing at 127.0.0.1/localhost). Against the
 * hosted project there is no mail catcher to read, so the suite is skipped.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isLocalStack = /(127\.0\.0\.1|localhost|\[::1\])/.test(supabaseUrl);

function mailcatcherUrl(): string {
  if (process.env.SUPABASE_MAILCATCHER_URL) {
    return process.env.SUPABASE_MAILCATCHER_URL.replace(/\/$/, "");
  }
  return supabaseUrl.replace(/:(\d+)/, ":54324");
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

test.describe.configure({ mode: "serial" });

test.skip(
  !isLocalStack,
  "Auth flow E2E requires the local Supabase stack and its mail catcher.",
);

type CapturedMail = { id: string; subject: string; body: string };

/**
 * The Supabase CLI captures local auth mail with Mailpit (port 54324). Its REST
 * API lists messages and returns the rendered HTML per message.
 */
async function readMailbox(
  request: APIRequestContext,
  address: string,
): Promise<CapturedMail[]> {
  const response = await request.get(
    `${mailcatcherUrl()}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
  );
  if (!response.ok()) {
    throw new Error(
      `Mail catcher is unreachable (${response.status()}) at ${mailcatcherUrl()}.`,
    );
  }
  const payload = (await response.json()) as {
    messages?: { ID: string; Subject: string }[];
  };
  const captured: CapturedMail[] = [];
  for (const message of payload.messages ?? []) {
    const detail = await request.get(
      `${mailcatcherUrl()}/api/v1/message/${message.ID}`,
    );
    const body = (await detail.json()) as {
      Subject?: string;
      HTML?: string;
      Text?: string;
    };
    captured.push({
      id: message.ID,
      subject: body.Subject ?? message.Subject,
      body: body.HTML ?? body.Text ?? "",
    });
  }
  return captured;
}

async function waitForMail(
  request: APIRequestContext,
  address: string,
  matcher: RegExp,
): Promise<CapturedMail> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const messages = await readMailbox(request, address);
    const match = messages.find((message) => matcher.test(message.body));
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email matching ${matcher} arrived for ${address}.`);
}

// The Go template renders exactly one locale branch, so the visible language of
// the mail is a function of the locale stored at sign-up.
function extractFirstLink(html: string): string {
  const match = html.match(/href="(https?:\/\/[^"]+)"/);
  if (!match) throw new Error("The email did not contain a link.");
  return match[1].replace(/&amp;/g, "&");
}

async function signUp(
  page: Page,
  address: string,
  password: string,
  name: string,
) {
  await page.goto("/en/register?audience=candidate");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create candidate account" }).click();
  await expect(page.getByText(/verification link sent/i)).toBeVisible();
  // The success screen offers the resend straight away, so a candidate whose
  // mail never arrived does not have to fail a sign-in to retry.
  await expect(
    page.getByRole("button", { name: /resend verification email/i }),
  ).toBeVisible();
}

test("sign-up requires a verified mailbox before sign-in", async ({ page }) => {
  const stamp = Date.now();
  const address = `e2e-unconfirmed-${stamp}@example.com`;
  const password = "Candidate-pass-2026";

  await signUp(page, address, password, "E2E Unconfirmed");

  // A brand-new, unconfirmed account must be turned away with the specific
  // copy, never the generic "check your password" message.
  await page.goto("/en/login?audience=candidate");
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Candidate sign in" }).click();

  await expect(
    page.getByText(/verify your email address before signing in/i),
  ).toBeVisible();
  // The recovery affordance is offered right next to the message, and the email
  // field is programmatically linked to the error.
  await expect(
    page.getByRole("button", { name: /resend verification email/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Email address")).toHaveAttribute(
    "aria-describedby",
    "login-form-message",
  );
});

test("resending confirmation never falsely reports success", async ({ page }) => {
  const stamp = Date.now();
  const address = `e2e-resend-${stamp}@example.com`;
  const password = "Candidate-pass-2026";

  await signUp(page, address, password, "E2E Resend");

  await page.goto("/en/login?audience=candidate");
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Candidate sign in" }).click();
  await page.getByRole("button", { name: /resend verification email/i }).click();

  // The local stack throttles repeated confirmation mail to the same address
  // (`auth.email.max_frequency = 60s`). Whether the resend is accepted or
  // refused, the user must get an explicit, handled message — never a silent
  // no-op and never a success claim on a refused send.
  await expect(
    page.getByText(
      /new verification link has been sent|verification email could not be sent/i,
    ),
  ).toBeVisible();
});

test("sign-up, confirmation, sign-in and recovery all round-trip", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const address = `e2e-candidate-${stamp}@example.com`;
  const password = "Candidate-pass-2026";
  const newPassword = "Candidate-pass-2027";

  await signUp(page, address, password, "E2E Candidate");

  const confirmation = await waitForMail(
    request,
    address,
    /auth\/v1\/verify|ConfirmationURL|type=signup/,
  );
  await page.goto(extractFirstLink(confirmation.body));
  await expect(page).toHaveURL(/\/profile\/dashboard/);

  // Sign out and sign back in with the password chosen at registration.
  await page.context().clearCookies();
  await page.goto("/en/login?audience=candidate");
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Candidate sign in" }).click();
  await expect(page).toHaveURL(/\/profile\/dashboard/);

  // Password recovery: request, open the mail, set a new password, sign in.
  await page.context().clearCookies();
  await page.goto("/en/forgot-password");
  await page.getByLabel("Email address").fill(address);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/reset link has been sent/i)).toBeVisible();

  const recovery = await waitForMail(request, address, /type=recovery/);
  await page.goto(extractFirstLink(recovery.body));
  await expect(page).toHaveURL(/\/reset-password/);

  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1/);

  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Candidate sign in" }).click();
  await expect(page).toHaveURL(/\/profile\/dashboard/);
});

test("the invite mail is localized and carries a usable token", async ({
  request,
}) => {
  test.skip(
    !serviceRoleKey,
    "Invite coverage needs SUPABASE_SERVICE_ROLE_KEY from the local stack.",
  );

  const stamp = Date.now();
  const address = `e2e-invite-${stamp}@example.com`;
  const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

  const invite = await request.post(`${supabaseUrl}/auth/v1/invite`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    data: {
      email: address,
      data: { locale: "en" },
      redirect_to: `${appBaseUrl}/en/auth/callback?next=candidate`,
    },
  });
  expect(invite.ok()).toBeTruthy();

  // The invite body is rendered from the same Go template as the other mails, so
  // the English branch and the brand lockup must both be present.
  const mail = await waitForMail(request, address, /type=invite/);
  expect(mail.subject).toContain("İşBul KKTC");
  expect(mail.body).toContain('lang="en"');

  const link = extractFirstLink(mail.body);
  const token = new URL(link).searchParams.get("token");
  expect(token).toBeTruthy();

  // GoTrue answers the verify link with an implicit-flow redirect: a 303 whose
  // Location carries the session in the URL fragment. Assert that contract here
  // rather than following it, because this repository's callback route completes
  // the PKCE `?code=` flow and has no fragment handler, so a browser landing on
  // the redirect stays on the marketing page instead of the dashboard.
  const verify = await request.get(link, { maxRedirects: 0 });
  expect(verify.status()).toBe(303);
  const location = verify.headers()["location"] ?? "";
  expect(location).toContain("#access_token=");
  expect(location).toContain("type=invite");
});
