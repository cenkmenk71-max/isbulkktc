import { expect, test } from "@playwright/test";

const locales = ["tr", "en", "ru", "el", "fa", "de"] as const;
const publicRoutes = [
  "/",
  "/companies",
  "/freelance",
  "/packages",
  "/about",
  "/blog",
  "/contact",
] as const;
const viewportWidths = [320, 390, 768, 1024, 1280, 1440] as const;

test("public routes stay within mobile, tablet, and desktop viewports in every locale", async ({
  page,
}) => {
  test.setTimeout(450_000);

  for (const locale of locales) {
    const prefix = locale === "tr" ? "" : `/${locale}`;

    for (const route of publicRoutes) {
      await page.goto(`${prefix}${route}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute(
        "data-scroll-behavior",
        "smooth",
      );
      await expect(page.locator("main")).toBeVisible();

      for (const width of viewportWidths) {
        await page.setViewportSize({ width, height: 900 });
        try {
          await expect
            .poll(
              () => page.evaluate(
                () =>
                  document.documentElement.scrollWidth <=
                  document.documentElement.clientWidth,
              ),
              {
                message: `${locale}${route} overflows at ${width}px`,
                timeout: 20_000,
              },
            )
            .toBe(true);
        } catch (error) {
          const details = await page.evaluate(() => {
            const root = document.documentElement;
            const describe = (element: HTMLElement) => {
              const rect = element.getBoundingClientRect();
              return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}.${[...element.classList].join(".")} rect=${Math.round(rect.left)}..${Math.round(rect.right)} scroll=${element.scrollWidth}/${element.clientWidth}`;
            };
            const elements = [...document.body.querySelectorAll<HTMLElement>("*")];
            const offenders = elements
              .map((element) => ({ element, rect: element.getBoundingClientRect() }))
              .filter(({ rect }) => rect.right > root.clientWidth + 1 || rect.left < -1)
              .sort((a, b) => Math.max(b.rect.right - root.clientWidth, -b.rect.left) - Math.max(a.rect.right - root.clientWidth, -a.rect.left))
              .slice(0, 10)
              .map(({ element }) => describe(element));
            const scrollables = elements
              .filter((element) => element.scrollWidth > element.clientWidth + 1)
              .sort((a, b) => (b.scrollWidth - b.clientWidth) - (a.scrollWidth - a.clientWidth))
              .slice(0, 10)
              .map(describe);
            return `url=${location.pathname}; dir=${root.dir}; document=${root.scrollWidth}/${root.clientWidth}; offenders=${offenders.join(" | ")}; scrollables=${scrollables.join(" | ")}`;
          });
          throw new Error(`${String(error)}\nOverflow details: ${details}`);
        }
      }
    }
  }
});
