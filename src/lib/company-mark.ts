/**
 * Deterministic visual identity for companies that have no logo on file.
 *
 * A monogram avatar is the professional fallback used by Google Workspace,
 * Slack and Notion alike: it keeps every directory entry recognisable and
 * gives the list a consistent, branded rhythm instead of empty placeholders.
 *
 * The tone is derived from the company name, so a company always receives the
 * same colour across the cards, the job lists and the company detail view.
 */

import type { CSSProperties } from "react";

export type CompanyBrandTone = {
  /** Upper-left gradient stop. */
  from: string;
  /** Lower-right gradient stop. */
  to: string;
};

/**
 * Curated, desaturated tones drawn from the brand's warm-paper and
 * shade-green palette. Keeping the set small and harmonised means the
 * directory reads as one designed system rather than a random colour wheel,
 * and every tone keeps white initials at accessible contrast.
 */
const brandTones: readonly CompanyBrandTone[] = [
  { from: "#2f7157", to: "#123528" }, // shade green
  { from: "#427f6a", to: "#1b4a3a" }, // sage
  { from: "#22646a", to: "#0d343a" }, // deep teal
  { from: "#3a5878", to: "#1c2f46" }, // slate blue
  { from: "#474b7e", to: "#252749" }, // indigo
  { from: "#5f4570", to: "#31233c" }, // plum
  { from: "#7c4150", to: "#431e28" }, // wine
  { from: "#8a4f34", to: "#4b2616" }, // terracotta
  { from: "#8a6a25", to: "#4b3810" }, // bronze
  { from: "#5b6a2e", to: "#2e3916" }, // olive
  { from: "#3f4a44", to: "#1f2726" }, // graphite
  { from: "#34564f", to: "#152f2a" }, // pine
];

/** FNV-1a keeps the mapping stable across server and client renders. */
function hashName(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

function normalizeName(value: string): string {
  return value
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const letterOrNumber = /[\p{L}\p{N}]/u;

function firstLetterOrNumber(word: string): string {
  return [...word].find((character) => letterOrNumber.test(character)) ?? "";
}

/**
 * Two-letter monogram built from the raw name so Turkish (I/İ/ı), Greek,
 * Cyrillic and Arabic characters survive intact instead of being stripped.
 * Punctuation-only words ("&", "Ltd.") are skipped, single words fall back to
 * their first two characters.
 */
export function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.map(firstLetterOrNumber).filter(Boolean);
  const initials =
    letters.length > 1
      ? `${letters[0]}${letters[1]}`
      : [...(words[0] ?? "")].slice(0, 2).join("");
  return initials.toLocaleUpperCase("tr");
}

export function companyBrandTone(name: string): CompanyBrandTone {
  return brandTones[hashName(normalizeName(name)) % brandTones.length];
}

/** CSS custom properties consumed by `.employer-logo-monogram`. */
export function companyMarkStyle(
  name: string,
): CSSProperties & Record<"--mark-from" | "--mark-to", string> {
  const tone = companyBrandTone(name);
  return { "--mark-from": tone.from, "--mark-to": tone.to };
}
