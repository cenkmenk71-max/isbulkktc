import assert from "node:assert/strict";
import test from "node:test";
import {
  companyProfileSchema,
  createCompanySchema,
} from "../../src/features/companies/schemas";
import {
  oauthSignInSchema,
  requestPasswordResetSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "../../src/features/identity/schemas";
import { parseEnabledOAuthProviders } from "../../src/features/identity/oauth-providers";
import {
  createOAuthSignupIntent,
  isNewOAuthAccount,
  parseOAuthSignupIntent,
} from "../../src/features/identity/oauth-signup-intent";

test("company creation trims names and canonicalizes ASCII slugs", () => {
  assert.deepEqual(
    createCompanySchema.parse({ name: " Örnek Şirket ", slug: "Ornek-Sirket" }),
    { name: "Örnek Şirket", slug: "ornek-sirket" },
  );
});

test("company profile submissions accept only the six supported districts", () => {
  const profile = {
    companyId: "00000000-0000-4000-8000-000000000001",
    companyName: "Example Ltd.",
    profileDescription: "",
    categoriesText: "",
    website: "",
    phone: "",
    publicEmail: "",
    address: "",
    municipality: "Mağusa",
    directoryTarget: "",
  };

  assert.equal(companyProfileSchema.safeParse(profile).success, true);
  assert.equal(
    companyProfileSchema.safeParse({
      ...profile,
      municipality: "Gazimağusa",
    }).success,
    false,
  );
  assert.equal(
    companyProfileSchema.safeParse({
      ...profile,
      municipality: "Küçük Kaymaklı",
    }).success,
    false,
  );
});

test("company slugs reject path separators, whitespace, and empty segments", () => {
  for (const slug of [
    "../admin",
    "two words",
    "-leading",
    "trailing-",
    "a--b",
    "valid-\n-trailing",
  ]) {
    assert.equal(createCompanySchema.safeParse({ name: "Geçerli Şirket", slug }).success, false);
  }
});

test("registration enforces input bounds and accepts each supported language", () => {
  assert.deepEqual(
    signUpSchema.parse({
      displayName: " Aday ",
      email: " Aday@Example.COM ",
      password: "correct-horse",
      audience: "candidate",
      locale: "tr",
    }),
    {
      displayName: "Aday",
      email: "aday@example.com",
      password: "correct-horse",
      audience: "candidate",
      locale: "tr",
    },
  );

  assert.equal(
    signUpSchema.safeParse({
      displayName: "A",
      email: "aday@example.com",
      password: "correct-horse",
      audience: "candidate",
      locale: "tr",
    }).success,
    false,
  );

  assert.equal(
    signUpSchema.safeParse({
      displayName: "Company contact",
      email: "contact@example.com",
      password: "correct-horse",
      audience: "employer",
      locale: "en",
    }).success,
    true,
  );
  for (const locale of ["tr", "en", "ru", "el", "fa", "de"]) {
    assert.equal(
      signUpSchema.safeParse({
        displayName: "Company contact",
        email: "contact@example.com",
        password: "correct-horse",
        audience: "employer",
        locale,
      }).success,
      true,
    );
  }
  assert.equal(
    signUpSchema.safeParse({
      displayName: "Company contact",
      email: "contact@example.com",
      password: "correct-horse",
      audience: "employer",
      locale: "xx",
    }).success,
    false,
  );
});

test("sign-in requires valid credentials, audience, and language", () => {
  assert.deepEqual(
    signInSchema.parse({
      email: "Employer@Example.com",
      password: "valid-password",
      audience: "employer",
      locale: "fa",
    }),
    {
      email: "employer@example.com",
      password: "valid-password",
      audience: "employer",
      locale: "fa",
    },
  );
  assert.equal(signInSchema.safeParse({
    email: "",
    password: "",
    audience: "candidate",
    locale: "tr",
  }).success, false);
  assert.equal(
    signInSchema.safeParse({
      email: "candidate@example.com",
      password: "secret",
      audience: "admin",
      locale: "en",
    }).success,
    false,
  );
  assert.equal(signInSchema.safeParse({
    email: "candidate@example.com",
    password: "secret",
    audience: "candidate",
    locale: "xx",
  }).success, false);
});

test("OAuth accepts only supported providers, audiences, and locales", () => {
  assert.deepEqual(
    oauthSignInSchema.parse({
      provider: "linkedin_oidc",
      audience: "employer",
      locale: "en",
      intent: "signup",
    }),
    {
      provider: "linkedin_oidc",
      audience: "employer",
      locale: "en",
      intent: "signup",
    },
  );

  for (const provider of ["instagram", "whatsapp", "unknown"]) {
    assert.equal(
      oauthSignInSchema.safeParse({
        provider,
        audience: "candidate",
        locale: "tr",
        intent: "signin",
      }).success,
      false,
    );
  }
  assert.equal(
    oauthSignInSchema.safeParse({
      provider: "google",
      audience: "admin",
      locale: "tr",
      intent: "signin",
    }).success,
    false,
  );
  assert.equal(
    oauthSignInSchema.safeParse({
      provider: "facebook",
      audience: "candidate",
      locale: "xx",
      intent: "signin",
    }).success,
    false,
  );
  assert.equal(
    oauthSignInSchema.safeParse({
      provider: "google",
      audience: "candidate",
      locale: "tr",
      intent: "admin",
    }).success,
    false,
  );
});

test("OAuth signup locale intent accepts only fresh supported locale state", () => {
  const now = Date.UTC(2026, 9, 22, 12);
  const value = createOAuthSignupIntent("fa", now);

  assert.deepEqual(parseOAuthSignupIntent(value, now), {
    locale: "fa",
    initiatedAt: now,
  });
  assert.equal(parseOAuthSignupIntent("he:1792670400000", now), null);
  assert.equal(parseOAuthSignupIntent("en:not-a-timestamp", now), null);
  assert.equal(parseOAuthSignupIntent("en:1792660000000", now), null);
  assert.ok(parseOAuthSignupIntent(`en:${now + 5_000}`, now));
  assert.equal(parseOAuthSignupIntent(`en:${now + 31_000}`, now), null);
});

test("OAuth signup locale applies only to an account created during that signup flow", () => {
  const now = Date.UTC(2026, 9, 22, 12);
  const intent = parseOAuthSignupIntent(
    createOAuthSignupIntent("de", now),
    now,
  );
  assert.ok(intent);

  assert.equal(
    isNewOAuthAccount(new Date(now + 5_000).toISOString(), intent, now + 10_000),
    true,
  );
  assert.equal(
    isNewOAuthAccount(new Date(now - 60_000).toISOString(), intent, now),
    false,
  );
  assert.equal(isNewOAuthAccount("invalid", intent, now), false);
});

test("OAuth availability is explicit, deduplicated, and rejects unknown providers", () => {
  assert.deepEqual(parseEnabledOAuthProviders(undefined), []);
  assert.deepEqual(parseEnabledOAuthProviders("google, linkedin_oidc,google"), [
    "google",
    "linkedin_oidc",
  ]);
  assert.throws(
    () => parseEnabledOAuthProviders("google,instagram"),
    /AUTH_OAUTH_PROVIDERS/,
  );
});

test("password reset requests canonicalize the email and reject bad locales", () => {
  assert.deepEqual(
    requestPasswordResetSchema.parse({
      email: "  Aday@Example.COM ",
      locale: "tr",
    }),
    { email: "aday@example.com", locale: "tr" },
  );

  assert.equal(
    requestPasswordResetSchema.safeParse({ email: "not-an-email", locale: "tr" })
      .success,
    false,
  );
  assert.equal(
    requestPasswordResetSchema.safeParse({ email: "a@b.com", locale: "xx" })
      .success,
    false,
  );
});

test("password updates enforce the shared eight-character minimum", () => {
  assert.equal(
    updatePasswordSchema.safeParse({ password: "a".repeat(8), locale: "en" })
      .success,
    true,
  );
  assert.equal(
    updatePasswordSchema.safeParse({ password: "a".repeat(7), locale: "en" })
      .success,
    false,
  );
  assert.equal(
    updatePasswordSchema.safeParse({ password: "a".repeat(129), locale: "en" })
      .success,
    false,
  );
});
