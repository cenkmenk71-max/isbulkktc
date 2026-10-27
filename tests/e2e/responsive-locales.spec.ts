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
            const offenders = [
              ...document.body.querySelectorAll<HTMLElement>("*"),
            ]
              .map((element) => ({
                element,
                rect: element.getBoundingClientRect(),
              }))
              .filter(
                ({ rect }) =>
                  rect.right > root.clientWidth + 1 || rect.left < -1,
              )
              .slice(0, 8)
              .map(
                ({ element, rect }) =>
                  `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}.${[...element.classList].join(".")} left=${Math.round(rect.left)} right=${Math.round(rect.right)}`,
              );
            const scrollables = [
              ...document.body.querySelectorAll<HTMLElement>("*"),
            ]
              .filter((element) => element.scrollWidth > element.clientWidth + 1)
              .slice(0, 5)
              .map(
                (element) =>
                  `${element.tagName.toLowerCase()}.${[...element.classList].join(".")} scroll=${element.scrollWidth}/${element.clientWidth}`,
              );
            return `dir=${root.dir}; document=${root.scrollWidth}/${root.clientWidth}; ${offenders.join(", ")}; scrollables=${scrollables.join(", ")}`;
          });
          throw new Error(`${String(error)}\nOverflow details: ${details}`);
        }
      }
    }
  }
});
