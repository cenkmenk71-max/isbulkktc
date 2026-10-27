import { expect, test, type Page } from "@playwright/test";
import {
  parseEnabledOAuthProviders,
} from "../../src/features/identity/oauth-providers";
import type { OAuthProvider } from "../../src/features/identity/schemas";

const configuredOAuthProviders = parseEnabledOAuthProviders(
  process.env.PLAYWRIGHT_AUTH_OAUTH_PROVIDERS,
);

const oauthProviderNames: Record<OAuthProvider, string> = {
  google: "Google",
  linkedin_oidc: "LinkedIn",
  facebook: "Facebook",
};

const oauthProviderBackgrounds: Record<OAuthProvider, string> = {
  google: "rgb(66, 133, 244)",
  linkedin_oidc: "rgb(10, 145, 189)",
  facebook: "rgb(66, 103, 178)",
};

async function expectConfiguredOAuthProviders(
  page: Page,
  audience: "candidate" | "employer",
  intent: "signin" | "signup",
) {
  const buttons = page.locator(".editorial-oauth-button");
  await expect(buttons).toHaveCount(3);
  const providerButtonMinHeight = await buttons
    .first()
    .evaluate((button) => Number.parseFloat(getComputedStyle(button).minHeight));
  expect(providerButtonMinHeight).toBeGreaterThanOrEqual(56);
  await expect(buttons.first()).toHaveCSS("border-radius", "999px");
  await expect(page.locator(".editorial-oauth-status")).toHaveCount(0);
  for (const provider of ["google", "linkedin_oidc", "facebook"] as const) {
    const button = page.getByRole("button", {
      name: new RegExp(oauthProviderNames[provider]),
    });
    await expect(button).toHaveCSS(
      "background-color",
      oauthProviderBackgrounds[provider],
    );
    await expect(button).toHaveCSS("opacity", "1");
  }
  const providerIconWidth = await buttons
    .first()
    .locator(".editorial-oauth-mark svg")
    .evaluate((icon) => Number.parseFloat(getComputedStyle(icon).width));
  expect(providerIconWidth).toBeGreaterThanOrEqual(23);
  await expect(
    page.getByRole("button", { name: /Instagram|WhatsApp/i }),
  ).toHaveCount(0);
  await expect(page.locator(".editorial-oauth-status")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /Hesabınızla devam edin|Continue with your account/ }),
  ).toBeVisible();
  await expect(
    page.locator(".editorial-oauth input[name='audience']"),
  ).toHaveValue(audience);
  await expect(
    page.locator(".editorial-oauth input[name='intent']"),
  ).toHaveValue(intent);
  for (const provider of configuredOAuthProviders) {
    const button = page.getByRole("button", {
      name: new RegExp(oauthProviderNames[provider]),
    });
    await expect(button).toBeVisible();
    await expect(
      button.locator(`[data-brand-icon='${provider}'] svg`),
    ).toHaveCount(1);
    await expect(button).toBeEnabled();
  }
  for (const provider of ["google", "linkedin_oidc", "facebook"] as const) {
    if (configuredOAuthProviders.includes(provider)) continue;
    const button = page.getByRole("button", {
      name: new RegExp(oauthProviderNames[provider]),
    });
    await expect(button).toBeVisible();
    await expect(
      button.locator(`[data-brand-icon='${provider}'] svg`),
    ).toHaveCount(1);
    await expect(button).toBeDisabled();
  }
  if (configuredOAuthProviders.length < 3) {
    await expect(page.locator("#oauth-provider-setup")).toBeVisible();
  }
}

test("registration, sign-in, and recovery pages stay localized and usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const locale of ["tr", "en"] as const) {
    const prefix = locale === "en" ? "/en" : "";
    const copy =
      locale === "tr"
        ? {
            title: "Kariyer yolculuğunuz için sağlam bir başlangıç.",
            employerTitle: "Şirketiniz için güvenli bir başlangıç.",
            employerLoginTitle: "Şirket kayıt adımınıza devam edin.",
            name: "Adınız",
            contactName: "Yetkili kişi adı",
            email: "E-posta adresi",
            accountEmail: "Hesap e-posta adresi",
            password: "Şifre",
            showPassword: "Şifreyi göster",
            employerCreate: "İşveren hesabı oluştur",
            employerSignInButton: "İşveren girişi",
            signIn: "Aday girişi",
            employerSignInTitle: "İşveren",
            employerSignInDescription: "Şirket kayıt adımına devam edin.",
            employerSignUpTitle: "İşveren",
            employerSignUpDescription: "Şirket kayıt adımına devam edin.",
            companyStep: "şirket bilgilerinizi ekleyeceğiniz kayıt formuna",
            audienceLabel: "Hesap türünüzü seçin",
            forgotPassword: "Şifrenizi mi unuttunuz?",
            resetUnavailable: "Şifre yenileme şu anda kullanılamıyor.",
          }
        : {
            title: "A considered start to your career journey.",
            employerTitle: "A secure start for your company.",
            employerLoginTitle: "Continue to your company registration.",
            name: "Your name",
            contactName: "Company contact name",
            email: "Email address",
            accountEmail: "Account email address",
            password: "Password",
            showPassword: "Show password",
            employerCreate: "Create employer account",
            employerSignInButton: "Employer sign in",
            signIn: "Candidate sign in",
            employerSignInTitle: "Employer",
            employerSignInDescription: "Continue to company registration.",
            employerSignUpTitle: "Employer",
            employerSignUpDescription: "Continue to company registration.",
            companyStep: "form for your company details",
            audienceLabel: "Choose your account type",
            forgotPassword: "Forgot your password?",
            resetUnavailable: "Password recovery is not available yet.",
          };

    await page.goto(locale === "tr" ? "/tr/register" : "/en/register");
    await expect(page.getByRole("heading", { level: 1, name: copy.title })).toBeVisible();
    const sceneMedia = page.locator(".editorial-page-scene-media");
    await expect(sceneMedia).toBeVisible();
    await expect(sceneMedia).toHaveCSS("position", "absolute");
    await expect(sceneMedia.locator(".editorial-page-scene-slide")).toHaveCount(4);
    const firstSlide = sceneMedia.locator(".editorial-page-scene-slide").first();
    await expect(firstSlide).not.toHaveAttribute("src", /\/_next\/image/);
    const renderedImage = await firstSlide.evaluate((element) => {
      if (!(element instanceof HTMLImageElement)) {
        throw new Error("Account background slide is not an image.");
      }

      return {
        naturalWidth: element.naturalWidth,
        renderedWidth: element.getBoundingClientRect().width,
      };
    });
    expect(renderedImage.naturalWidth).toBeGreaterThanOrEqual(
      renderedImage.renderedWidth,
    );
    const sceneHeight = await page
      .locator(".editorial-page-scene")
      .evaluate((scene) => scene.getBoundingClientRect().height);
    expect(sceneHeight).toBeLessThanOrEqual(780);
    const sceneCopyGeometry = await page.evaluate(() => {
      const scene = document.querySelector(".editorial-page-scene");
      const copy = document.querySelector(".editorial-page-scene-copy");
      if (!(scene instanceof HTMLElement) || !(copy instanceof HTMLElement)) {
        throw new Error("Account scene or scene copy is missing.");
      }

      const sceneBounds = scene.getBoundingClientRect();
      const copyBounds = copy.getBoundingClientRect();
      return {
        insetLeft: copyBounds.left - sceneBounds.left,
        insetRight: sceneBounds.right - copyBounds.right,
        bottomGap: sceneBounds.bottom - copyBounds.bottom,
        widthRatio: copyBounds.width / sceneBounds.width,
        marginLeft: getComputedStyle(copy).marginLeft,
        backgroundImage: getComputedStyle(copy).backgroundImage,
      };
    });
    expect(sceneCopyGeometry.insetLeft).toBeGreaterThanOrEqual(20);
    expect(sceneCopyGeometry.insetRight).toBeGreaterThanOrEqual(20);
    expect(sceneCopyGeometry.widthRatio).toBeGreaterThanOrEqual(0.82);
    expect(sceneCopyGeometry.widthRatio).toBeLessThanOrEqual(0.9);
    expect(sceneCopyGeometry.bottomGap).toBeGreaterThan(80);
    expect(sceneCopyGeometry.marginLeft).toBe("0px");
    expect(sceneCopyGeometry.backgroundImage).toContain("0.32");
    await expect(sceneMedia.getByRole("group").getByRole("button")).toHaveCount(3);
    await expect(sceneMedia.locator("video")).toHaveCount(0);
    const headerBottom = await page
      .locator(".site-header")
      .evaluate((header) => header.getBoundingClientRect().bottom);
    const backLinkTop = await page
      .locator(".editorial-back-link")
      .evaluate((link) => link.getBoundingClientRect().top);
    expect(backLinkTop).toBeGreaterThan(headerBottom);
    await expect(page.getByLabel(copy.name)).toBeVisible();
    await expect(page.getByLabel(copy.email)).toBeVisible();
    await expectConfiguredOAuthProviders(page, "candidate", "signup");
    await expect(
      page.getByRole("navigation", { name: copy.audienceLabel }).getByRole("link", { name: /Candidate|Aday/ }),
    ).toHaveAttribute("aria-current", "page");

    const registrationPassword = page.getByLabel(copy.password, { exact: true });
    await expect(registrationPassword).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: copy.showPassword }).click();
    await expect(registrationPassword).toHaveAttribute("type", "text");
    await expect(
      page.locator(".editorial-form input[name='audience']"),
    ).toHaveValue("candidate");

    const audiencePicker = page.getByRole("navigation", { name: copy.audienceLabel });
    await audiencePicker.getByRole("link", { name: /Employer|İşveren/ }).click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/register\\?audience=employer$`));
    await expect(page.getByRole("heading", { level: 1, name: copy.employerTitle })).toBeVisible();
    await expect(page.getByLabel(copy.contactName)).toBeVisible();
    await expect(page.getByLabel(copy.accountEmail)).toBeVisible();
    await expectConfiguredOAuthProviders(page, "employer", "signup");
    await expect(
      page.locator(".editorial-form input[name='audience']"),
    ).toHaveValue("employer");
    await expect(page.getByRole("button", { name: copy.employerCreate })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.employerCreate })).toHaveCSS(
      "min-height",
      "56px",
    );
    await expect(page.locator(".editorial-form-note")).toContainText(copy.companyStep);

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
      const mobileSceneSpacing = await page.evaluate(() => {
        const copy = document.querySelector(".editorial-page-scene-copy");
        const controls = document.querySelector(
          ".editorial-page-scene-video-controls",
        );
        if (!(copy instanceof HTMLElement) || !(controls instanceof HTMLElement)) {
          throw new Error("Account scene composition is missing.");
        }

        return (
          controls.getBoundingClientRect().top -
          copy.getBoundingClientRect().bottom
        );
      });
      expect(mobileSceneSpacing).toBeGreaterThan(12);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await audiencePicker.getByRole("link", { name: /Candidate|Aday/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: copy.title })).toBeVisible();

    const scenePhoto = await page.request.get(
      "/images/account-gallery/vuni-sarayi.webp",
    );
    expect(scenePhoto.ok()).toBe(true);
    expect(scenePhoto.headers()["content-type"]).toContain("image/webp");

    const candidateSignInLink = page
      .locator(".editorial-form-footnote")
      .getByRole("link", { name: copy.signIn });
    await expect(candidateSignInLink).toHaveAttribute(
      "href",
      `${prefix}/login?audience=candidate`,
    );
    await page.goto(`${prefix}/login?audience=candidate`);
    await expect(page.getByRole("heading", { level: 1, name: /Aday profilinize dönün|Return to your candidate profile/ })).toBeVisible();
    await expect(page.locator(".editorial-page-scene-media")).toBeVisible();
    await expect(
      page.locator(".editorial-page-scene-media").locator("video"),
    ).toHaveCount(0);
    await page
      .locator(".editorial-page-scene-video-controls")
      .getByRole("button", { name: "Othello Kalesi" })
      .click();
    const selectedVideo = page.locator(".editorial-page-scene-video");
    await expect(selectedVideo).toBeVisible();
    await expect(selectedVideo.locator("source")).toHaveAttribute(
      "src",
      "/videos/account-gallery/othello-kalesi.mp4",
    );
    await expect(selectedVideo).toHaveCSS("position", "absolute");
    await expect
      .poll(() =>
        selectedVideo.evaluate(
          (video) =>
            video instanceof HTMLVideoElement &&
            !video.paused &&
            video.readyState >= 2,
        ),
      )
      .toBe(true);
    const videoResolution = await selectedVideo.evaluate((video) => ({
      width: video instanceof HTMLVideoElement ? video.videoWidth : 0,
      height: video instanceof HTMLVideoElement ? video.videoHeight : 0,
    }));
    expect(videoResolution).toEqual({ width: 1080, height: 1920 });
    await expect(page.getByLabel(copy.email)).toBeVisible();
    await expectConfiguredOAuthProviders(page, "candidate", "signin");
    const signInPassword = page.getByLabel(copy.password, { exact: true });
    await expect(signInPassword).toHaveAttribute("type", "password");
    await expect(
      page.locator(".editorial-auth-email-button"),
    ).toHaveCSS("border-radius", "999px");
    await page.getByRole("button", { name: copy.showPassword }).click();
    await expect(signInPassword).toHaveAttribute("type", "text");
    await expect(
      page.locator(".editorial-form input[name='audience']"),
    ).toHaveValue("candidate");

    const signInAudiencePicker = page.getByRole("navigation", { name: copy.audienceLabel });
    await signInAudiencePicker.getByRole("link", { name: /Employer|İşveren/ }).click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/login\\?audience=employer$`));
    await expect(page.getByRole("heading", { level: 1, name: copy.employerLoginTitle })).toBeVisible();
    await expect(page.getByLabel(copy.accountEmail)).toBeVisible();
    await expectConfiguredOAuthProviders(page, "employer", "signin");
    await expect(
      page.locator(".editorial-form input[name='audience']"),
    ).toHaveValue("employer");
    await expect(page.getByRole("button", { name: copy.employerSignInButton })).toBeVisible();
    await expect(page.locator(".editorial-auth-email-button")).toHaveCSS(
      "min-height",
      "56px",
    );

    await page.getByRole("link", { name: copy.forgotPassword }).click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/forgot-password$`));
    await expect(page.getByRole("status")).toContainText(copy.resetUnavailable);
    await expect(page.getByRole("textbox")).toHaveCount(0);

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
    }
  }
});
