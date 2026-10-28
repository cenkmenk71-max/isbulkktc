import { expect, test } from "@playwright/test";

test("homepage typography keeps an editorial hierarchy and readable controls across viewports", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tr?district=invalid");

  const desktopTypography = await page
    .locator("#home-title")
    .evaluate((heading) => {
      const headingStyle = getComputedStyle(heading);
      const bodyStyle = getComputedStyle(document.body);
      const field = document.querySelector<HTMLInputElement>(
        ".home-job-search-field input",
      );
      const button = document.querySelector<HTMLElement>(
        ".home-job-search-submit",
      );
      return {
        displayFont: headingStyle.fontFamily,
        displayWeight: Number(headingStyle.fontWeight),
        bodySize: Number.parseFloat(bodyStyle.fontSize),
        controlSize: field
          ? Number.parseFloat(getComputedStyle(field).fontSize)
          : 0,
        buttonSize: button
          ? Number.parseFloat(getComputedStyle(button).fontSize)
          : 0,
      };
    });

  expect(desktopTypography.displayFont).toContain("Literata");
  expect(desktopTypography.displayWeight).toBeGreaterThanOrEqual(600);
  expect(desktopTypography.displayWeight).toBeLessThanOrEqual(700);
  expect(desktopTypography.bodySize).toBe(15);
  expect(desktopTypography.controlSize).toBe(14);
  expect(desktopTypography.buttonSize).toBe(13);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHeading = page.locator("#home-title");
  await expect(mobileHeading).toBeVisible();
  await expect
    .poll(() =>
      mobileHeading.evaluate((heading) => {
        const root = document.documentElement;
        const rect = heading.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.right <= root.clientWidth + 1 &&
          Number.parseFloat(getComputedStyle(heading).fontSize) >= 36
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("homepage cycles through local district photos with an animated light-ray layer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tr?district=invalid");

  await expect(page).toHaveTitle(/Kuzey Kıbrıs’ta iş ve kariyer/);
  await expect(
    page.getByRole("heading", {
      name: "Kuzey Kıbrıs’ta kariyerinizin bir sonraki adımını keşfedin.",
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".home-hero-slide")
        .evaluateAll((images) =>
          Math.max(
            ...images.map((image) => Number(getComputedStyle(image).opacity)),
          ),
        ),
    )
    .toBeGreaterThan(0.9);
  await expect
    .poll(() =>
      page
        .locator(".home-hero-slide")
        .evaluateAll((images: HTMLImageElement[]) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await expect(page.locator(".hero-light-layer--readability")).toHaveCount(1);
  await expect(page.locator(".hero-light-layer--warmth")).toHaveCount(1);
  await expect(page.locator(".hero-light-layer--vignette")).toHaveCount(1);
  await expect(page.locator(".home-hero-rays")).toHaveCount(1);
  await expect(page.locator(".hero-section .hero-description")).toHaveCount(0);
  await expect(
    page.locator(".hero-scene-frame,.hero-scene-foliage,.hero-scene-window"),
  ).toHaveCount(0);
  const girnePhoto = await page
    .locator('[data-home-hero-photo="girne"]')
    .evaluate((image: HTMLImageElement) => {
      const imageUrl = new URL(image.currentSrc);
      return {
        loaded: image.complete && image.naturalWidth > 0,
        currentSrc: image.currentSrc,
        source: imageUrl.searchParams.get("url") ?? imageUrl.pathname,
        quality: imageUrl.searchParams.get("q"),
        requestedWidth: Number(imageUrl.searchParams.get("w")),
        renderedWidth: image.getBoundingClientRect().width,
        loading: image.loading,
        fetchPriority: image.fetchPriority,
        animationDelay: getComputedStyle(image).animationDelay,
        transform: getComputedStyle(image).transform,
        animationDuration: getComputedStyle(image).animationDuration,
        animationTimingFunction:
          getComputedStyle(image).animationTimingFunction,
      };
    });
  expect(girnePhoto).toMatchObject({
    loaded: true,
    source: expect.stringMatching(/^\/_next\/static\/media\/.+\.webp$/),
    quality: "100",
    loading: "eager",
    fetchPriority: "high",
    animationDelay: "-0.5s",
    transform: "none",
    animationDuration: "48s",
    animationTimingFunction: "linear",
  });
  const optimizedGirnePhoto = await page.request.get(girnePhoto.currentSrc, {
    headers: { Accept: "image/avif,image/webp,*/*" },
  });
  expect(optimizedGirnePhoto.ok()).toBe(true);
  expect(optimizedGirnePhoto.headers()["content-type"]).toContain("image/webp");
  expect((await optimizedGirnePhoto.body()).length).toBeLessThan(2_500_000);

  const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
  expect(girnePhoto.requestedWidth).toBeGreaterThanOrEqual(
    girnePhoto.renderedWidth * devicePixelRatio,
  );

  const slides = await page
    .locator(".home-hero-slide")
    .evaluateAll((images: HTMLImageElement[]) =>
      images.map((image) => {
        const imageUrl = new URL(image.currentSrc);
        return {
          district: image.dataset.homeHeroPhoto,
          asset: image.dataset.homeHeroSource,
          loaded: image.complete && image.naturalWidth > 0,
          optimized: imageUrl.pathname === "/_next/image",
          quality: imageUrl.searchParams.get("q"),
          source: imageUrl.searchParams.get("url") ?? imageUrl.pathname,
          objectPosition: getComputedStyle(image).objectPosition,
          loading: image.loading,
          fetchPriority: image.fetchPriority,
          animationDelay: getComputedStyle(image).animationDelay,
          transform: getComputedStyle(image).transform,
        };
      }),
    );
  expect(slides).toEqual([
    {
      district: "girne",
      asset: "/images/Girne.webp",
      loaded: true,
      optimized: true,
      quality: "100",
      source: expect.stringMatching(/^\/_next\/static\/media\/.+\.webp$/),
      objectPosition: "50% 50%",
      loading: "eager",
      fetchPriority: "high",
      animationDelay: "-0.5s",
      transform: "none",
    },
    {
      district: "gazimagusa",
      asset: "/images/Gazimağusa.webp",
      loaded: true,
      optimized: true,
      quality: "100",
      source: expect.stringMatching(/^\/_next\/static\/media\/.+\.webp$/),
      objectPosition: "50% 50%",
      loading: "eager",
      fetchPriority: "low",
      animationDelay: "7.5s",
      transform: "none",
    },
    {
      district: "guzelyurt",
      asset: "/images/güzelyurt.jpg",
      loaded: true,
      optimized: true,
      quality: "100",
      source: expect.stringMatching(/^\/_next\/static\/media\/.+\.jpg$/),
      objectPosition: "100% 100%",
      loading: "lazy",
      fetchPriority: "low",
      animationDelay: "15.5s",
      transform: "none",
    },
    {
      district: "iskele",
      asset: "/images/iskele.jpg",
      loaded: true,
      optimized: true,
      quality: "100",
      source: expect.stringMatching(/^\/_next\/static\/media\/.+\.jpg$/),
      objectPosition: "50% 78%",
      loading: "lazy",
      fetchPriority: "low",
      animationDelay: "23.5s",
      transform: "none",
    },
    {
      district: "lefkosa",
      asset: "/images/lefkoşa.jpeg",
      loaded: true,
      optimized: true,
      quality: "100",
      source: expect.stringMatching(/^\/_next\/static\/media\/.+\.jpeg$/),
      objectPosition: "50% 50%",
      loading: "lazy",
      fetchPriority: "low",
      animationDelay: "31.5s",
      transform: "none",
    },
    {
      district: "lefke",
      asset: "/images/lefke.jpg",
      loaded: true,
      optimized: true,
      quality: "100",
      source: expect.stringMatching(/^\/_next\/static\/media\/.+\.jpg$/),
      objectPosition: "50% 50%",
      loading: "lazy",
      fetchPriority: "low",
      animationDelay: "39.5s",
      transform: "none",
    },
  ]);

  const sourcePhotos = await Promise.all(
    slides.map(({ source }) => page.request.get(source)),
  );
  for (const [index, sourcePhoto] of sourcePhotos.entries()) {
    expect(sourcePhoto.ok()).toBe(true);
    const expectedType = /\.(?:jpe?g)$/.test(slides[index].source)
      ? "image/jpeg"
      : "image/webp";
    expect(sourcePhoto.headers()["content-type"]).toContain(expectedType);
    expect(Number(sourcePhoto.headers()["content-length"])).toBeLessThan(
      9_000_000,
    );
  }

  await expect
    .poll(
      () =>
        page
          .locator('[data-home-hero-photo="gazimagusa"]')
          .evaluate((image) => Number(getComputedStyle(image).opacity)),
      { timeout: 12_000 },
    )
    .toBeGreaterThan(0.9);
});

test("homepage requests hero image variants for high-density screens", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    deviceScaleFactor: 2,
    viewport: { width: 1440, height: 900 },
  });

  try {
    const page = await context.newPage();
    await page.goto("/tr?district=invalid");
    const photos = page.locator(".home-hero-slide");
    await expect(photos).toHaveCount(6);
    await expect
      .poll(() =>
        photos.evaluateAll((images: HTMLImageElement[]) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
      )
      .toBe(true);

    const requestedVariants = await photos.evaluateAll(
      (images: HTMLImageElement[]) =>
        images.map((image) => {
          const imageUrl = new URL(image.currentSrc);
          return {
            district: image.dataset.homeHeroPhoto,
            quality: imageUrl.searchParams.get("q"),
            requestedWidth: Number(imageUrl.searchParams.get("w")),
            renderedWidth: image.getBoundingClientRect().width,
            source: imageUrl.searchParams.get("url"),
          };
        }),
    );

    for (const variant of requestedVariants) {
      expect(variant.quality).toBe("100");
      expect(variant.source).toBeTruthy();
      expect(variant.requestedWidth).toBeGreaterThanOrEqual(
        variant.renderedWidth * 2,
      );
    }

    const deliveredPixels = await page.evaluate(
      async (variants) => {
        const sourceWidths: Record<string, number> = {
          girne: 3840,
          gazimagusa: 1216,
          guzelyurt: 2048,
          iskele: 1638,
          lefkosa: 1920,
          lefke: 1024,
        };

        return Promise.all(
          variants.map(async (variant) => {
            const response = await fetch(variant.currentSrc);
            const bitmap = await createImageBitmap(await response.blob());
            const width = bitmap.width;
            bitmap.close();
            return {
              district: variant.district,
              width,
              expectedWidth: Math.min(
                variant.requestedWidth,
                sourceWidths[variant.district ?? ""],
              ),
            };
          }),
        );
      },
      await photos.evaluateAll((images: HTMLImageElement[]) =>
        images.map((image) => {
          const imageUrl = new URL(image.currentSrc);
          return {
            district: image.dataset.homeHeroPhoto ?? "",
            currentSrc: image.currentSrc,
            requestedWidth: Number(imageUrl.searchParams.get("w")),
          };
        }),
      ),
    );

    for (const { width, expectedWidth } of deliveredPixels) {
      expect(width).toBe(expectedWidth);
    }
  } finally {
    await context.close();
  }
});

test("homepage photo and ray animations respect reduced-motion preferences", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tr?district=invalid");

  await expect(page.locator('[data-home-hero-photo="girne"]')).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(page.locator('[data-home-hero-photo="gazimagusa"]')).toHaveCSS(
    "opacity",
    "0",
  );
  await expect(page.locator(".home-hero-rays")).toHaveCSS(
    "animation-name",
    "none",
  );
});

test("home keeps candidate and company actions in the journey section", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/tr");

  const hero = page.locator(".hero-section");
  await expect(hero.locator("#candidate-start,#company-start")).toHaveCount(0);
  await expect(hero.locator(".home-career-visual")).toHaveCount(0);
  await expect(hero.locator("img[src*='career-search']")).toHaveCount(0);
  const candidateJourney = page.locator(".home-journey-card--candidate");
  const employerJourney = page.locator(".home-journey-card--employer");
  await expect(candidateJourney.locator("h3")).toHaveText(
    "CV’nizden profil taslağına. Son söz sizde.",
  );
  await expect(
    candidateJourney.locator(".home-journey-steps > li"),
  ).toHaveCount(3);
  await expect(candidateJourney).toContainText(
    "CV dosyanız sunucuya yüklenmez; ayrıştırma tarayıcınızda yapılır.",
  );
  await expect(candidateJourney.locator(".home-journey-link")).toHaveAttribute(
    "href",
    "/register",
  );
  await expect(employerJourney.locator("h3")).toHaveText(
    "Şirketinizi tanıtın. İlan sürecini güvenle yönetin.",
  );
  await expect(employerJourney.locator(".home-journey-steps > li")).toHaveCount(
    3,
  );
  await expect(employerJourney).toContainText(
    "İlan yayını, şirket doğrulaması ve yayın yetkisinin tanımlanmasına bağlıdır.",
  );
  await expect(employerJourney.locator(".home-journey-link")).toHaveAttribute(
    "href",
    "/register?audience=employer",
  );
  await expect(page.locator(".signature-tagline")).toHaveCount(0);
  await expect(page.locator(".signature-feature")).toHaveCount(3);
  await expect(
    page.getByRole("heading", {
      name: "Kuzey Kıbrıs’ta öne çıkan çalışma alanları",
    }),
  ).toBeVisible();
  await expect(page.locator(".sector-card")).toHaveCount(20);
  await expect(page.locator(".sector-featured-grid .sector-card")).toHaveCount(
    4,
  );
  await expect(page.locator(".sector-directory-trigger")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(
    page.locator(
      ".sector-featured-grid .sector-card[data-sector='technology']",
    ),
  ).toBeVisible();
  await expect(
    page.locator(".sector-explorer .sector-card[data-sector='architecture']"),
  ).not.toBeVisible();
  await expect(page.locator(".sector-card a")).toHaveCount(0);
  for (const card of await page.locator(".sector-card").all()) {
    await expect(card.locator(".sector-icon")).toHaveCount(1);
    await expect(card.locator(".sector-icon svg")).toHaveCount(1);
  }
  await expect(
    page.getByRole("region", { name: "İşBul KKTC özellikleri" }),
  ).toContainText("Yayındaki ilanları keşfedin");
  await expect(
    page.locator(".job-card,.employer-workspace,.region-network-visual"),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /demo|örnek|sample|başvuru gönderildi/i,
  );

  const primaryNavigation = page.getByRole("navigation", {
    name: "Ana gezinme",
  });
  await expect(
    primaryNavigation.getByRole("link", { name: "Ana sayfa" }),
  ).toHaveCount(0);
  await expect(page.locator(".header-brand")).toHaveAttribute("href", /#top$/);
  await expect(
    primaryNavigation.getByRole("link", { name: "Şirketler" }),
  ).toHaveAttribute("href", "/companies");
  await expect(
    primaryNavigation.getByRole("link", { name: "Paketler" }),
  ).toHaveAttribute("href", "/packages");

  await page.setViewportSize({ width: 390, height: 844 });
  const menuButton = page.getByRole("button", { name: "Menüyü aç" });
  const mobileNavigation = page.locator("#mobile-primary-navigation");
  await expect(menuButton).toHaveAttribute(
    "aria-controls",
    "mobile-primary-navigation",
  );
  await expect(mobileNavigation).toHaveAttribute("hidden", "");
  await menuButton.click();
  await expect(mobileNavigation).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Menüyü kapat" }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(mobileNavigation).toHaveAttribute("hidden", "");
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(menuButton).toBeFocused();

  await menuButton.click();
  await expect(mobileNavigation).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-scroll-behavior",
    "smooth",
  );
  await expect(
    mobileNavigation.getByRole("link", { name: "Ana sayfa" }),
  ).toHaveCount(0);
});

test("anonymous visitors can search job previews without opening job details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    "/tr?query=unmatched-role-token-2026&district=Girne&jobType=full_time&workplaceMode=hybrid",
  );

  const section = page.getByRole("region", {
    name: "Fırsatları hesap açmadan keşfedin.",
  });
  await expect(section).toBeVisible();
  await expect(
    section.getByRole("searchbox", { name: "Pozisyon veya şirket" }),
  ).toHaveValue("unmatched-role-token-2026");
  await expect(section.getByLabel("Konum")).toHaveValue("Girne");
  await expect(section.getByLabel("Çalışma türü")).toHaveValue("full_time");
  await expect(section.getByLabel("Çalışma düzeni")).toHaveValue("hybrid");

  const previews = section.locator(".home-job-preview");
  expect(await previews.count()).toBeLessThanOrEqual(6);
  for (const preview of await previews.all()) {
    await expect(preview.locator("h4")).toBeVisible();
    await expect(preview.locator("p")).toBeVisible();
    await expect(preview.locator("a, button, details")).toHaveCount(0);
    await expect(preview.locator(":scope > *")).toHaveCount(2);
  }

  await page.goto("/tr?page=0");
  await expect(page.locator(".home-job-search-error")).toHaveText(
    "Arama filtreleri geçersiz. Seçimlerinizi kontrol edip yeniden deneyin.",
  );
});

test("homepage sector content stays centered and within the viewport responsively", async ({
  page,
}) => {
  await page.goto("/tr");

  const container = page.locator(".sector-showcase > .page-container");
  const cardGrid = page.locator(".sector-featured-grid .sector-card-grid");
  const journeyCard = page.locator(".home-journey-card--candidate");

  for (const width of [
    390, 740, 768, 1024, 1060, 1061, 1280, 1299, 1300, 1440, 1920,
  ]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const container = document.querySelector(
        ".sector-showcase > .page-container",
      );
      const cards = document.querySelector(
        ".sector-featured-grid .sector-card-grid",
      );
      if (!container || !cards) {
        throw new Error("Homepage sector layout is missing.");
      }

      const containerBounds = container.getBoundingClientRect();
      const cardsBounds = cards.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      return {
        leftGap: containerBounds.left,
        rightGap: viewportWidth - containerBounds.right,
        cardsLeft: cardsBounds.left,
        cardsRight: cardsBounds.right,
        containerLeft: containerBounds.left,
        containerRight: containerBounds.right,
      };
    });

    expect(
      Math.abs(layout.leftGap - layout.rightGap),
      `sector content should be centered at ${width}px`,
    ).toBeLessThanOrEqual(1);
    expect(layout.cardsLeft).toBeGreaterThanOrEqual(layout.containerLeft);
    expect(layout.cardsRight).toBeLessThanOrEqual(layout.containerRight);
    await expect(container).toBeVisible();
    await expect(cardGrid.locator(".sector-card")).toHaveCount(4);
    const journeyCardBounds = await journeyCard.boundingBox();
    if (!journeyCardBounds) {
      throw new Error("The candidate journey card is not visible.");
    }
    expect(journeyCardBounds.x + journeyCardBounds.width).toBeLessThanOrEqual(
      width,
    );
  }
});

test("sector cards animate on hover only when motion is allowed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/tr");

  const card = page.locator(".sector-card").first();
  const photo = card.locator(".sector-photo");
  await expect(card).toBeVisible();
  await card.hover();
  await expect(card).toHaveCSS("transform", /^matrix/);
  await expect(photo).toHaveCSS("transform", /^matrix/);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await card.hover();
  await expect(card).toHaveCSS("transform", "none");
  await expect(photo).toHaveCSS("transform", "none");
});

test("company, about and contact heroes use distinct local photos", async ({
  page,
}) => {
  const heroImages = [
    [
      "/companies",
      ".company-directory-hero-image",
      "/images/company-directory.webp",
    ],
    ["/about", ".editorial-hero-aside-image", "/images/about-community.webp"],
    [
      "/contact",
      ".editorial-hero-aside-image",
      "/images/contact-community.webp",
    ],
    ["/blog", ".editorial-hero-aside-image", "/images/editorial-newsroom.webp"],
  ] as const;

  for (const [route, selector, expectedPath] of heroImages) {
    await page.goto(`/tr${route}`);
    const image = page.locator(selector);
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const photo = element as HTMLImageElement;
          return {
            loaded: photo.complete && photo.naturalWidth > 0,
            path: photo.src ? new URL(photo.src).searchParams.get("url") : null,
          };
        }),
      )
      .toMatchObject({ loaded: true, path: expectedPath });
  }
});

test("sector cards use the matching optimized photos in both locales", async ({
  page,
}) => {
  const sectorPhotos = [
    ["technology", "pexels-zayed-hossain-52728970-36706460.jpg"],
    ["education", "pexels-max-fischer-5212338.jpg"],
    ["health", "pexels-shvetsa-6291246.jpg"],
    ["tourism", "pexels-imda-12160204.jpg"],
    ["architecture", "pexels-a-darmel-7641896.jpg"],
    ["construction", "pexels-anthonyshkraba-production-8278912.jpg"],
    ["businessServices", "pexels-august-de-richelieu-4427422.jpg"],
    ["gastronomy", "pexels-emris-17086288.jpg"],
    ["manufacturing", "pexels-frans-van-heerden-201846-13974251.jpg"],
    ["creativeMedia", "pexels-jonathanborba-13451104.jpg"],
    ["remoteWork", "pexels-mikhail-nilov-8297074.jpg"],
    ["renewableEnergy", "pexels-nc-farm-bureau-mark-15751132.jpg"],
    ["agriculture", "pexels-nc-farm-bureau-mark-28513536.jpg"],
    ["foodProduction", "pexels-silverkblack-36697940.jpg"],
    ["hospitality", "pexels-quang-nguyen-vinh-222549-14036250.jpg"],
    ["logistics", "pexels-shuaizhi-tian-485596-20715652.jpg"],
  ] as const;

  for (const locale of ["tr", "en"]) {
    await page.goto(`/${locale}`);
    await expect(page.locator(".sector-card")).toHaveCount(
      sectorPhotos.length + 4,
    );
    await page.locator(".sector-directory-trigger").click();
    await expect(page.locator(".sector-directory-trigger")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(page.locator(".sector-explorer")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name:
          locale === "tr"
            ? "Kuzey Kıbrıs’ta çalışma alanınızı keşfedin"
            : "Explore career fields across Northern Cyprus",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("searchbox", {
        name:
          locale === "tr" ? "Çalışma alanlarında ara" : "Search career areas",
      }),
    ).toBeVisible();

    for (const [key, original] of sectorPhotos) {
      const card = page
        .locator(".sector-explorer")
        .locator(`.sector-card[data-sector="${key}"]`);
      const originalAssetPattern = new RegExp(
        original.replace(/\.jpg$/, "\\.[\\w-]+\\.jpg"),
      );
      await expect(card).toHaveCount(1);
      await expect(card).toHaveAttribute(
        "data-sector-image",
        originalAssetPattern,
      );
      await expect(card.locator("strong")).toBeVisible();
      await expect(card.locator("small")).not.toBeEmpty();
      await card.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          card.locator("img").evaluate((element: HTMLImageElement) => {
            if (!element.currentSrc) {
              return { loaded: false, optimized: false };
            }
            const source = new URL(element.currentSrc);
            return {
              loaded: element.complete && element.naturalWidth > 0,
              optimized: source.pathname === "/_next/image",
              source: source.searchParams.get("url"),
              naturalWidth: element.naturalWidth,
              naturalHeight: element.naturalHeight,
            };
          }),
        )
        .toMatchObject({ loaded: true, optimized: true });

      const currentSrc = await card
        .locator("img")
        .evaluate((element: HTMLImageElement) => element.currentSrc);
      const optimizedUrl = new URL(currentSrc);
      expect(optimizedUrl.searchParams.get("url")).toMatch(
        originalAssetPattern,
      );
      expect(optimizedUrl.searchParams.get("q")).toBe("100");
      const response = await page.request.get(currentSrc, {
        headers: { Accept: "image/avif,image/webp,*/*" },
      });
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain("image/webp");
      expect((await response.body()).length).toBeLessThan(600_000);
    }
  }
});

test("the sector directory searches and filters all sectors", async ({
  page,
}) => {
  const more = page.locator(".sector-directory");
  const toggle = more.locator("button.sector-directory-trigger");
  const explorer = more.locator(".sector-explorer");
  const search = explorer.getByRole("searchbox", {
    name: "Çalışma alanlarında ara",
  });
  const cards = explorer.locator(".sector-card");
  const results = explorer.locator(".sector-explorer-results");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tr");
  await expect(toggle).toContainText("Çalışma alanlarını keşfet");
  await expect(
    more.locator(
      ".sector-featured-grid .sector-card[data-sector='technology']",
    ),
  ).toBeVisible();
  await expect(
    explorer.locator(".sector-card[data-sector='architecture']"),
  ).not.toBeVisible();

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(explorer).toBeVisible();
  await expect(cards).toHaveCount(16);
  await expect(results).toContainText("16 çalışma alanı gösteriliyor");
  await expect(more.locator(".sector-featured-grid")).not.toBeVisible();
  await expect(
    explorer.locator(".sector-card[data-sector='architecture']"),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);

  await search.fill("enerji");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-sector", "renewableEnergy");
  await expect(results).toContainText("1 çalışma alanı gösteriliyor");
  await expect(
    explorer.getByRole("button", { name: /Üretim & altyapı 1/ }),
  ).toBeVisible();

  await search.fill("software");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-sector", "technology");
  await expect(cards.first().locator(".sector-featured-marker")).toHaveText(
    "Öne çıkan",
  );
  await expect(
    explorer.getByRole("button", {
      name: /Dijital, yaratıcı ve esnek çalışma 1/,
    }),
  ).toBeVisible();

  await search.fill("SAGLIK");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-sector", "health");
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(cards).toHaveCount(16);

  await search.fill("gida");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-sector", "foodProduction");

  await search.fill("olmayan-bir-alan");
  await expect(cards).toHaveCount(0);
  await expect(
    explorer.getByRole("heading", { name: "Eşleşen çalışma alanı bulunamadı" }),
  ).toBeVisible();
  await explorer.getByRole("button", { name: "Filtreleri temizle" }).click();
  await expect(cards).toHaveCount(16);
  await expect(search).toHaveValue("");

  const industryFilter = explorer.getByRole("button", {
    name: /Üretim & altyapı/,
  });
  await industryFilter.click();
  await expect(industryFilter).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(7);
  await expect(
    explorer.locator(".sector-card[data-sector='technology']"),
  ).toHaveCount(0);
  await expect(
    explorer.locator(".sector-card[data-sector='architecture']"),
  ).toHaveCount(1);

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.locator(".sector-card[data-sector='architecture']"),
  ).not.toBeVisible();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(industryFilter).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(7);
  await explorer
    .getByRole("button", { name: "Tüm filtreleri temizle" })
    .click();
  await expect(cards).toHaveCount(16);
  await expect(industryFilter).toHaveAttribute("aria-pressed", "false");
});

test("sector category badges stay legible and unclipped", async ({ page }) => {
  const measureBadges = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".sector-image-category")]
        .map((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width < 1) return null;
          return {
            fontSize: parseFloat(getComputedStyle(el).fontSize),
            clipped: el.scrollWidth > el.clientWidth + 1,
            text: el.textContent?.trim() ?? "",
          };
        })
        .filter((badge) => badge !== null),
    );

  await page.setViewportSize({ width: 390, height: 844 });
  for (const locale of ["/tr", "/de"]) {
    await page.goto(locale);
    await page.locator("button.sector-directory-trigger").click();
    const badges = await measureBadges();
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(
        badge.fontSize,
        `${locale} "${badge.text}" font-size`,
      ).toBeGreaterThanOrEqual(10);
      expect(badge.clipped, `${locale} "${badge.text}" must not clip`).toBe(
        false,
      );
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopBadges = await measureBadges();
  for (const badge of desktopBadges) {
    expect(badge.fontSize).toBeGreaterThanOrEqual(11);
    expect(badge.clipped).toBe(false);
  }
});

test("freelance career page links to the real candidate profile flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tr/freelance");

  await expect(
    page.getByRole("heading", {
      name: "Serbest çalışma deneyiminizi aday profilinizde düzenleyin.",
    }),
  ).toBeVisible();
  await expect(page.locator(".freelance-hero-aside")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Hesabına giriş yap" }),
  ).toBeVisible();
  await expect(page.locator(".freelance-profile-points article")).toHaveCount(
    3,
  );
  await expect
    .poll(() =>
      page
        .locator(".freelance-hero-image")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  const heroImageSource = await page
    .locator(".freelance-hero-image")
    .evaluate((image: HTMLImageElement) => {
      const decoded = new URL(
        image.currentSrc,
        window.location.href,
      ).searchParams.get("url");
      return decoded ?? image.currentSrc;
    });
  expect(heroImageSource).toMatch(/unsplash-1498050108023-c5249f4df085/);
  const desktopHero = await page.evaluate(() => {
    const hero = document
      .querySelector(".freelance-hero")!
      .getBoundingClientRect();
    const copy = document
      .querySelector(".freelance-hero-copy")!
      .getBoundingClientRect();
    const media = document
      .querySelector(".freelance-hero-media")!
      .getBoundingClientRect();
    return {
      hero: {
        left: hero.left,
        right: hero.right,
        top: hero.top,
        bottom: hero.bottom,
      },
      copy: { left: copy.left, right: copy.right },
      media: {
        left: media.left,
        right: media.right,
        top: media.top,
        bottom: media.bottom,
      },
    };
  });
  expect(Math.abs(desktopHero.media.left - desktopHero.hero.left)).toBeLessThan(
    2,
  );
  expect(
    Math.abs(desktopHero.media.right - desktopHero.hero.right),
  ).toBeLessThan(2);
  expect(desktopHero.media.top).toBeLessThanOrEqual(desktopHero.hero.top + 2);
  expect(desktopHero.media.bottom).toBeGreaterThanOrEqual(
    desktopHero.hero.bottom - 2,
  );
  expect(desktopHero.copy.left).toBeGreaterThanOrEqual(desktopHero.hero.left);
  expect(desktopHero.copy.right).toBeLessThanOrEqual(
    desktopHero.hero.right + 1,
  );
  const headingFont = await page
    .locator(".freelance-hero-copy h1")
    .evaluate((heading) => getComputedStyle(heading).fontFamily);
  expect(headingFont).toContain("Literata");
  expect(
    await page.evaluate(() =>
      document.fonts.check("600 48px Literata", "İşBul KKTC"),
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const hero = document
          .querySelector(".freelance-hero")!
          .getBoundingClientRect();
        const media = document
          .querySelector(".freelance-hero-media")!
          .getBoundingClientRect();
        const copy = document
          .querySelector(".freelance-hero-copy")!
          .getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        return (
          Math.abs(media.left - hero.left) < 2 &&
          media.right <= viewportWidth + 1 &&
          copy.right <= viewportWidth + 1 &&
          copy.width > 0
        );
      }),
    )
    .toBe(true);
  await expect(
    page.getByRole("link", { name: "Profilini oluştur" }).first(),
  ).toHaveAttribute("href", "/register");
  await expect(page.locator("body")).not.toContainText(
    /demo|örnek|sample|kategori önizlemesi/i,
  );
});

test("localized landing pages remain within narrow viewports", async ({
  page,
}) => {
  for (const locale of ["tr", "en", "ru", "el", "fa", "de"]) {
    await page.goto(locale === "tr" ? "/" : `/${locale}`);
    await expect(page.locator(".hero-section")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const journeyCards = page.locator(".home-journey-card");
    await expect(journeyCards).toHaveCount(2);
    await expect(journeyCards.nth(0).locator("h3")).not.toHaveText("");
    await expect(journeyCards.nth(1).locator("h3")).not.toHaveText("");
    await expect(page.locator(".home-journey-steps > li")).toHaveCount(6);

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
