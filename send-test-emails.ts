import { sendMarketingEmail } from "./src/server/email/mailer";

const locales = ["tr", "en", "ru", "el", "fa", "de"];
const testEmail = "denem7785@outlook.com";

async function sendAll() {
  for (const locale of locales) {
    try {
      const result = await sendMarketingEmail({
        to: testEmail,
        locale,
        unsubscribeUrl: "https://isbulkktc.com/api/email/unsubscribe?e=x&s=y",
        campaignId: `test-${Date.now()}`,
      });
      console.log(`✅ ${locale.toUpperCase()}: ${result ? "sent" : "failed"}`);
    } catch (error) {
      console.error(`❌ ${locale.toUpperCase()}:`, error);
    }
  }
  console.log("\nAll emails sent!");
}

sendAll();