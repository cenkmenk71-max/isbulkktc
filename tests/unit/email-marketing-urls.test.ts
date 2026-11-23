/**
 * Unit tests for mailto URL encoding in `renderMarketingEmail`.
 *
 * Covers: boşlukların %20 olarak kodlanması (URLSearchParams'ta `+` yerine),
 * Türkçe karakterlerin doğru UTF-8 percent-sırasıyla dönüştürülmesi, ve
 * mailto satır sonunun RFC 6068 uygun CRLF (%0D%0A) ile olması.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { encodeMailto, MAILTO_LINE_BREAK } from "../../supabase/functions/_shared/email-render.ts";

test("mailto boşlukları %20 olarak kodlar, + olarak değil", () => {
  const result = encodeMailto("Merhaba İşBul KKTC");
  assert.ok(result.includes("%20"));
  assert.ok(!result.includes("+"));
});

test("mailto Türkçe karakterleri UTF-8 percent-sırasıyla kodlar", () => {
  assert.strictEqual(encodeMailto("ödemek"), "%C3%B6demek");
  assert.strictEqual(encodeMailto("şirket"), "%C5%9Firket");
  assert.strictEqual(
    encodeMailto("çıkış"),
    "%C3%A7%C4%B1k%C4%B1%C5%9F"
  );
});

test("mailto satır sonu CRLF (%0D%0A) kullanır", () => {
  assert.strictEqual(MAILTO_LINE_BREAK, "%0D%0A");
});

test("mailto özel karakterler (#, &, ?, =) encode edilir", () => {
  const result = encodeMailto("https://isbulkktc.com/tr/packages#packages-current?utm=1&ref=2");
  assert.ok(result.includes("%23"));
  assert.ok(!result.includes("#"));
  assert.ok(result.includes("%3F"));
  assert.ok(!result.includes("?"));
  assert.ok(result.includes("%26"));
  assert.ok(!result.includes("&"));
  assert.ok(result.includes("%3D"));
  assert.ok(!result.includes("="));
});

test("mailto amaç satırında boşluk %20 olur", () => {
  const result = encodeMailto("İşBul KKTC işveren paketleri");
  assert.ok(result.includes("%20"));
  assert.ok(!result.includes("+"));
});
