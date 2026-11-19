import test from "node:test";
import { renderMarketingEmail } from "../../supabase/functions/_shared/email-render";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const locales = ["tr", "en", "ru", "el", "fa", "de"];

test("render all marketing emails for visual inspection", async () => {
  const outputDir = join(process.cwd(), "test-output", "marketing-emails");
  
  for (const locale of locales) {
    const email = renderMarketingEmail({
      locale,
      siteUrl: "https://isbulkktc.com/",
      unsubscribeUrl: "https://isbulkktc.com/api/email/unsubscribe?e=x&s=y",
    });
    
    console.log(`\n${"=".repeat(60)}`);
    console.log(`LOCALE: ${locale.toUpperCase()}`);
    console.log(`Subject: ${email.subject}`);
    console.log(`${"=".repeat(60)}\n`);
    
    // Write HTML file
    const htmlPath = join(outputDir, `${locale}.html`);
    writeFileSync(htmlPath, email.html, "utf8");
    
    // Write text file
    const textPath = join(outputDir, `${locale}.txt`);
    writeFileSync(textPath, email.text, "utf8");
    
    console.log(`Written: ${htmlPath}`);
    console.log(`Written: ${textPath}`);
  }
});