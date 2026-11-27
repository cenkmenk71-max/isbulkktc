/**
 * Kademeli müşteri firma gönderim betiği.
 *
 * `firmalar.txt` dosyasını okur (her satırda `email@firma.com` veya
 * `Firma Adı,email@firma.com` biçiminde), daha önce gönderilmiş adresleri
 * `outreach-sent.log` üzerinden filtreler, kalanlara en fazla 30 adet,
 * sadece Türkçe (`locale: "tr"`) ve her gönderim arasında 3 saniye aralıkla
 * `sendMarketingEmail` ile gönderir. Başarılı her gönderim sonrası adres
 * `outreach-sent.log`'a eklenir, böylece aynı adres iki kez gönderilmez.
 *
 * Kullanım:
 *   bun --conditions=react-server --env-file=.env.local run scripts/send-outreach-batch.ts
 */

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { sendMarketingEmail } from "../src/server/email/mailer.ts";

const ROOT = resolve(import.meta.dirname, "..");
const FIRMALAR_FILE = resolve(ROOT, "firmalar.txt");
const SENT_LOG = resolve(ROOT, "outreach-sent.log");
const DEFAULT_BATCH = 30;
const DELAY_MS = 3000;
const LOCALE = "tr";
const UNSUBSCRIBE_BASE = "https://isbulkktc.com/api/email/unsubscribe";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readSentAddresses(): Set<string> {
  if (!existsSync(SENT_LOG)) return new Set();
  const content = readFileSync(SENT_LOG, "utf8");
  return new Set(
    content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
}

function parseFirmalar(lines: string[]): Array<{ name?: string; email: string }> {
  const result: Array<{ name?: string; email: string }> = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const comma = line.indexOf(",");
    if (comma === -1) {
      result.push({ email: line });
    } else {
      result.push({ name: line.slice(0, comma).trim(), email: line.slice(comma + 1).trim() });
    }
  }
  return result;
}

function unsubscribeUrl(email: string): string {
  const encoded = encodeURIComponent(email.toLowerCase());
  return `${UNSUBSCRIBE_BASE}?e=${encoded}&s=outreach`;
}

async function main(): Promise<void> {
  if (!existsSync(FIRMALAR_FILE)) {
    console.error(`firmalar.txt bulunamadı: ${FIRMALAR_FILE}`);
    process.exit(1);
  }

  const sent = readSentAddresses();
  const lines = readFileSync(FIRMALAR_FILE, "utf8").split("\n");
  const recipients = parseFirmalar(lines);

  let queued = 0;
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    if (queued >= DEFAULT_BATCH) break;

    const email = recipient.email.toLowerCase();
    if (sent.has(email)) {
      skippedCount++;
      console.log(`[ATLA] ${email} zaten gönderilmiş`);
      continue;
    }

    queued++;
    const campaignId = `outreach/${new Date().toISOString().slice(0, 10)}-${queued}`;
    const accepted = await sendMarketingEmail({
      to: recipient.email,
      locale: LOCALE,
      unsubscribeUrl: unsubscribeUrl(recipient.email),
      campaignId,
    });

    if (accepted) {
      appendFileSync(SENT_LOG, `${email}\n`, "utf8");
      sent.add(email);
      sentCount++;
      console.log(`[OK] ${email} (${recipient.name ?? "—"})`);
    } else {
      failedCount++;
      console.log(`[FAIL] ${email} gönderimi kabul edilmedi`);
    }

    if (queued < DEFAULT_BATCH) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nÖzet: kuyruğa al=${queued}, gönderildi=${sentCount}, atlandı(doğru)=${skippedCount}, başarısız=${failedCount}`);
}

main().catch((error) => {
  console.error("Betik hatası:", error);
  process.exit(1);
});
