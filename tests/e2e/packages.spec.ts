import { expect, test } from "@playwright/test";

const locales = [
  {
    path: "/tr/packages",
    locale: "tr",
    title: "İşe alım hakları, açık ve anlaşılır.",
    catalog: "İlan yayınlama hakları",
    empty: "Henüz etkin paket tanımlanmadı.",
    status: "Bilgilendirme amaçlı fiyat · Ödeme sitede alınmaz; IBAN talimatı paket görüşmesi sonrası özel kanaldan iletilir.",
  },
  {
    path: "/en/packages",
    locale: "en",
    title: "Hiring rights, clearly defined.",
    catalog: "Job posting rights",
    empty: "No active packages are configured yet.",
    status: "Indicative pricing · Payment is not taken on the website; IBAN instructions are shared privately after discussing the package.",
  },
  {
    path: "/ru/packages",
    locale: "ru",
    title: "Права на найм — чётко и прозрачно.",
    catalog: "Права на публикацию вакансий",
    empty: "Активные пакеты ещё не настроены.",
    status: "Ориентировочные цены · Оплата на сайте не принимается; реквизиты IBAN и инструкции сообщаются лично после обсуждения пакета.",
  },
  {
    path: "/el/packages",
    locale: "el",
    title: "Σαφή δικαιώματα για τις προσλήψεις σας.",
    catalog: "Δικαιώματα δημοσίευσης θέσεων",
    empty: "Δεν έχουν ρυθμιστεί ακόμη ενεργά πακέτα.",
    status: "Ενδεικτικές τιμές · Η πληρωμή δεν γίνεται στον ιστότοπο· τα στοιχεία IBAN και οι οδηγίες αποστέλλονται ιδιωτικά μετά τη συζήτηση του πακέτου.",
  },
  {
    path: "/fa/packages",
    locale: "fa",
    title: "حقوق استخدام، روشن و مشخص.",
    catalog: "حقوق انتشار آگهی شغلی",
    empty: "هنوز بسته فعالی تنظیم نشده است.",
    status: "قیمت‌ها صرفاً برای اطلاع‌رسانی هستند · پرداخت در وب‌سایت انجام نمی‌شود؛ اطلاعات IBAN و دستورالعمل پرداخت پس از گفتگو درباره بسته، خصوصی ارسال می‌شود.",
  },
  {
    path: "/de/packages",
    locale: "de",
    title: "Klare Rechte für Ihre Personalsuche.",
    catalog: "Rechte für Stellenanzeigen",
    empty: "Es sind noch keine aktiven Pakete eingerichtet.",
    status: "Unverbindliche Preisangaben · Zahlungen erfolgen nicht auf der Website; IBAN und Zahlungsanweisungen werden nach Besprechung des Pakets privat mitgeteilt.",
  },
];

test("package proposals and the interactive vending machine are public", async ({
  page,
}) => {
  test.setTimeout(60_000);
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
    await expect(page.locator(".package-proposal-status")).toHaveCount(4);
    await expect(page.locator(".package-proposal-status").first()).toHaveText(
      copy.status,
    );
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
  await expect(
    page.locator(".packages-vend-accessible-controls button"),
  ).toHaveCount(5);

  const machine = page.locator(".packages-vend-stage");
  await page.locator(".packages-vend-accessible-controls button").nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(machine).toHaveAttribute("data-selected-package", "growth");

  await page.locator(".packages-vend-accessible-controls button").last().focus();
  await page.keyboard.press("Enter");
  await expect(machine).toHaveAttribute("data-duration", "1");
});
