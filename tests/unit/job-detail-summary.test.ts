import assert from "node:assert/strict";
import test from "node:test";

import { isRedundantJobSummary } from "../../src/features/jobs/presentation";

test("hides a summary that repeats the opening of the description", () => {
  assert.equal(
    isRedundantJobSummary(
      "Görev ve Sorumluluklar • Misafirleri güler yüzle karşılamak…",
      "Görev ve Sorumluluklar • Misafirleri güler yüzle karşılamak ve kaliteli hizmet sunmak.",
    ),
    true,
  );
});

test("tolerates whitespace differences between summary and description", () => {
  assert.equal(
    isRedundantJobSummary(
      "Kısa özet\n ikinci satır",
      "Kısa özet  ikinci satır ve devamı.",
    ),
    true,
  );
});

test("keeps a summary that adds information beyond the description", () => {
  assert.equal(
    isRedundantJobSummary(
      "Ayrı bir kısa tanıtım cümlesi.",
      "Pozisyon açıklaması tamamen farklı bir metinle başlar.",
    ),
    false,
  );
});

test("keeps a summary when either field is missing", () => {
  assert.equal(isRedundantJobSummary(null, "Açıklama"), false);
  assert.equal(isRedundantJobSummary("Özet", null), false);
  assert.equal(isRedundantJobSummary(undefined, undefined), false);
  assert.equal(isRedundantJobSummary("", "Açıklama"), false);
});

test("keeps a summary that is only punctuation", () => {
  assert.equal(isRedundantJobSummary("…", "Açıklama metni."), false);
});
