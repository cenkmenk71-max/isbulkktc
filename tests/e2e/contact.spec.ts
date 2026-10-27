import { expect, test } from "@playwright/test";

test("contact page publishes the provided email, phone, WhatsApp and location", async ({
  page,
}) => {
  await page.goto("/tr/contact");

  const email = page.getByRole("link", { name: "info@isbulkktc.com" });
  const emailHref = await email.getAttribute("href");
  expect(emailHref).toBeTruthy();
  const [emailAddress, emailQuery] = emailHref!.split("?");
  expect(emailAddress).toBe("mailto:info@isbulkktc.com");
  const emailDraft = new URLSearchParams(emailQuery);
  expect(emailDraft.get("subject")).toBe("İşBul KKTC iletişim");
  expect(emailDraft.get("body")).toContain("Merhaba İşBul KKTC");
  expect(emailDraft.get("body")).toContain("Mesajınızı buraya yazın.");
  expect(emailDraft.get("body")).toContain("Adınız:");

  const phone = page.getByRole("link", { name: "0539 131 64 21" });
  await expect(phone).toHaveAttribute("href", "tel:+905391316421");

  const whatsapp = page.getByRole("link", { name: "WhatsApp’tan yazın" });
  await expect(whatsapp).toHaveAttribute(
    "href",
    "https://wa.me/905391316421",
  );
  await expect(whatsapp).toHaveAttribute("target", "_blank");
  await expect(page.getByText("Alsancak, KKTC").first()).toBeVisible();
  await expect(page.getByText("henüz yayımlanmadı")).toHaveCount(0);
});
