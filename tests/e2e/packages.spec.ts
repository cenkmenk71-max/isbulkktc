import { expect, test } from "@playwright/test";

const locales = [
  {
    path: "/tr/packages",
    locale: "tr",
    title: "İşe alım hakları, açık ve anlaşılır.",
    catalog: "İlan yayınlama hakları",
    empty: "Henüz etkin paket tanımlanmadı.",
  },
  {
    path: "/en/packages",
    locale: "en",
    title: "Hiring rights, clearly defined.",
    catalog: "Job posting rights",
    empty: "No active packages are configured yet.",
  },
  {
    path: "/ru/packages",
    locale: "ru",
    title: "Права на найм — чётко и прозрачно.",
    catalog: "Права на публикацию вакансий",
    empty: "Активные пакеты ещё не настроены.",
  },
  {
    path: "/el/packages",
    locale: "el",
    title: "Σαφή δικαιώματα για τις προσλήψεις σας.",
    catalog: "Δικαιώματα δημοσίευσης θέσεων",
    empty: "Δεν έχουν ρυθμιστεί ακόμη ενεργά πακέτα.",
  },
  {
    path: "/fa/packages",
    locale: "fa",
    title: "حقوق استخدام، روشن و مشخص.",
    catalog: "حقوق انتشار آگهی شغلی",
    empty: "هنوز بسته فعالی تنظیم نشده است.",
  },
  {
    path: "/de/packages",
    locale: "de",
    title: "Klare Rechte für Ihre Personalsuche.",
    catalog: "Rechte für Stellenanzeigen",
    empty: "Es sind noch keine aktiven Pakete eingerichtet.",
  },
];

test("package proposals and the interactive vending machine are public", async ({
  page,
}) => {
  test.setTimeout(180_000);
  for (const copy of locales) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(copy.path);

    await expect(page.locator("html")).toHaveAttribute("lang", copy.locale);
    await expect(
      page.getByRole("heading", { level: 1, name: copy.title }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: copy.catalog }),
    ).toBeVisible();
    await expect(page.locator(".packages-vend-copy h2")).toBeVisible();
    await expect(page.locator(".package-proposal-status")).toHaveCount(0);
    await expect(page.locator(".package-proposal-prices")).toHaveCount(3);
    await expect(page.locator(".packages-vend-stage")).toBeVisible();

    const cards = page.locator(
      'section[aria-labelledby="package-catalog-title"] .package-catalog-card',
    );
    if ((await cards.count()) === 0) {
      await expect(page.locator(".package-catalog-empty")).toHaveText(
        copy.empty,
      );
    } else {
      for (const card of await cards.all()) {
        await expect(card.locator("h3")).toBeVisible();
        await expect(card.locator("dl dt")).toHaveCount(2);
        await expect(card.locator("dl dd")).toHaveCount(2);
      }
    }
  }

  await page.goto("/packages");
  await page.locator(".packages-vend-stage").scrollIntoViewIfNeeded();
  const machine = page.locator(".packages-vend-stage");
  const fallback = page.locator(".packages-vend-fallback");
  const canvas = page.locator(".packages-vend-canvas canvas");

  // Both paths are valid: render the machine where WebGL 2 is supported, and
  // provide fully working package controls if the browser/GPU cannot create it.
  await expect
    .poll(async () => (await fallback.isVisible()) || (await canvas.isVisible()), {
      timeout: 20_000,
    })
    .toBe(true);

  if (await fallback.isVisible()) {
    await expect(page.locator(".packages-vend-fallback-controls button")).toHaveCount(4);
    await page.locator(".packages-vend-fallback-controls button").nth(1).click();
    await expect(machine).toHaveAttribute("data-selected-package", "growth");
    // Panel opening is driven by the 3D frame loop; software renderers need slack.
    await expect(page.locator(".vend-panel")).toBeVisible({ timeout: 15_000 });
  } else {
    await expect(
      page.locator(".packages-vend-accessible-controls button"),
    ).toHaveCount(5);
    await expect(canvas).toBeVisible();

    // A visible stage or hidden accessibility buttons do not prove the WebGL
    // scene rendered. Sample the actual canvas framebuffer for non-uniform pixels.
    // Do not call canvas.getContext() here: probing before React Three Fiber
    // mounts its renderer would create the context first, without
    // preserveDrawingBuffer, and every later readback would be blank.
    await page.waitForFunction(
      () => {
        const canvasElement = document.querySelector<HTMLCanvasElement>(
          ".packages-vend-canvas canvas",
        );
        if (
          !canvasElement ||
          canvasElement.width < 32 ||
          canvasElement.height < 32
        ) {
          return false;
        }

        // Downsample the preserved WebGL output to a tiny 32x32 probe. This verifies
        // real non-uniform pixels without allocating a full-resolution framebuffer copy
        // on every poll (which can be tens of megabytes on HiDPI displays).
        const probe = document.createElement("canvas");
        probe.width = 32;
        probe.height = 32;
        const context = probe.getContext("2d");
        if (!context) return false;
        context.drawImage(canvasElement, 0, 0, probe.width, probe.height);
        const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
        const colors = new Set<string>();
        for (let offset = 0; offset < pixels.length; offset += 4) {
          colors.add(`${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`);
        }
        return colors.size > 10;
      },
      undefined,
      { polling: 250, timeout: 30_000 },
    );

    await page.locator(".packages-vend-accessible-controls button").nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(machine).toHaveAttribute("data-selected-package", "growth");

    await page.locator(".packages-vend-accessible-controls button").last().focus();
    await page.keyboard.press("Enter");
    await expect(machine).toHaveAttribute("data-duration", "1");
  }
});


test("package pricing stays usable when WebGL 2 is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        // Simulate an environment that exposes WebGL 1 but cannot create WebGL 2.
        // Current Three.js requires WebGL 2, so the app must select its DOM fallback.
        if (type === "webgl2") return null;
        return Reflect.apply(originalGetContext, this, [type, ...args]);
      },
    });
  });

  await page.goto("/packages");
  const machine = page.locator(".packages-vend-stage");
  await machine.scrollIntoViewIfNeeded();
  await expect(page.locator(".packages-vend-fallback")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.locator(".packages-vend-fallback-controls button"),
  ).toHaveCount(4);
  await page.locator(".packages-vend-fallback-controls button").nth(1).click();
  await expect(machine).toHaveAttribute("data-selected-package", "growth");
  // Panel opening is driven by the 3D frame loop; software renderers need slack.
  await expect(page.locator(".vend-panel")).toBeVisible({ timeout: 15_000 });
});


test("package vending machine remains rendered when label canvas allocation fails", async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        // Simulate a preview/browser where large 2D label canvases cannot be
        // allocated. The app should keep the 3D geometry with tiny DataTextures.
        if (type === "2d" && this.width >= 512 && this.height >= 192) return null;
        return Reflect.apply(originalGetContext, this, [type, ...args]);
      },
    });
  });

  await page.goto("/packages");
  const machine = page.locator(".packages-vend-stage");
  const canvas = page.locator(".packages-vend-canvas canvas");
  await machine.scrollIntoViewIfNeeded();
  // Dev-mode dynamic import plus software WebGL can take a while under load.
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".packages-vend-fallback")).toHaveCount(0);

  await page.waitForFunction(
    () => {
      const element = document.querySelector<HTMLCanvasElement>(".packages-vend-canvas canvas");
      if (!element || element.width < 32 || element.height < 32) return false;
      const probe = document.createElement("canvas");
      probe.width = 32;
      probe.height = 32;
      const context = probe.getContext("2d");
      if (!context) return false;
      context.drawImage(element, 0, 0, 32, 32);
      const pixels = context.getImageData(0, 0, 32, 32).data;
      const colors = new Set<string>();
      for (let offset = 0; offset < pixels.length; offset += 4) {
        colors.add(`${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`);
      }
      return colors.size > 10;
    },
    undefined,
    { polling: 250, timeout: 30_000 },
  );

  // The accessibility twins are 1px, clipped, keyboard-only controls (pointer
  // users click the 3D machine itself), so activate them the way they are used.
  await page.locator(".packages-vend-accessible-controls button").nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(machine).toHaveAttribute("data-selected-package", "growth");
  // Panel opening is driven by the 3D frame loop; software renderers need slack.
  await expect(page.locator(".vend-panel")).toBeVisible({ timeout: 15_000 });
});
