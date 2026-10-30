/**
 * Pure consent model. No DOM access lives here so the parsing, migration and
 * cookie-encoding rules can be pinned by `node:test` and reused by both the
 * banner and the `/cookies` page.
 *
 * Two storage channels are written for one decision:
 *  - `localStorage` is the fast, cross-tab source of truth the banner renders.
 *  - the `ib_consent` cookie is the compact, server-readable copy (any future
 *    server-side gating reads it without a round trip).
 *
 * The cookie is deliberately NOT `httpOnly`: the banner must be able to clear
 * it when the visitor withdraws consent, and it holds no secret — only the two
 * booleans the visitor already chose.
 */

export const consentStorageKey = "isbulkkktc-cookie-consent-v3";
export const legacyConsentStorageKey = "isbulkkktc-cookie-consent-v2";
export const consentCookieName = "ib_consent";
export const consentChangedEvent = "isbulkkktc:cookie-consent";
export const consentOpenEvent = "isbulkkktc:cookie-consent-open";

/** Consent is re-asked after this window, per common EU guidance (≤13 months). */
export const consentCookieMaxAgeSeconds = 180 * 24 * 60 * 60;
export const consentMaxAgeMs = consentCookieMaxAgeSeconds * 1000;
export const consentVersion = 3;

export const consentCategories = ["analytics", "marketing"] as const;
export type ConsentCategory = (typeof consentCategories)[number];
export type ConsentDecision = Record<ConsentCategory, boolean>;

export type ConsentState = ConsentDecision & {
  decided: boolean;
  updatedAt: string | null;
};

export const undecidedConsent: ConsentState = {
  decided: false,
  analytics: false,
  marketing: false,
  updatedAt: null,
};

function decisionFrom(analytics: boolean, marketing: boolean): ConsentDecision {
  return { analytics, marketing };
}

export function isConsentCategory(value: string): value is ConsentCategory {
  return (consentCategories as readonly string[]).includes(value);
}

/** Matches the consent cookie plus any chunked `…​.0`, `…​.1` variants. */
export function isConsentCookieName(name: string): boolean {
  return name === consentCookieName || name.startsWith(`${consentCookieName}.`);
}

/** Alias kept so callers can express "the stored cookie, if any". */
export function decodeConsentCookie(value: string | undefined | null): ConsentDecision | null {
  return parseConsentCookie(value);
}

/**
 * Accepts every shape this key has held since launch:
 *  - `"granted"` / `"denied"` (v1, a bare string)
 *  - `{"analytics":bool,"marketing":bool}` (v2, no version)
 *  - `{"version":3,"analytics":bool,"marketing":bool,"updatedAt":iso}` (v3)
 * An unknown or malformed value is treated as "no decision", which re-asks the
 * visitor rather than silently assuming consent.
 */
export function parseConsent(raw: string | null | undefined, now = Date.now()): ConsentState {
  if (!raw) return undecidedConsent;

  if (raw === "granted") {
    return { decided: true, ...decisionFrom(true, false), updatedAt: null };
  }
  if (raw === "denied") {
    return { decided: true, ...decisionFrom(false, false), updatedAt: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undecidedConsent;
  }

  if (typeof parsed !== "object" || parsed === null) return undecidedConsent;
  const record = parsed as Record<string, unknown>;
  if (typeof record.analytics !== "boolean" || typeof record.marketing !== "boolean") {
    return undecidedConsent;
  }

  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : null;

  // A decision older than the retention window is stale: ask again rather than
  // silently honouring it forever. An unknown timestamp is kept (legacy v1/v2
  // records carry none) so an upgrade does not drop a recent choice.
  if (updatedAt !== null) {
    const decidedAt = Date.parse(updatedAt);
    if (!Number.isNaN(decidedAt) && now - decidedAt > consentMaxAgeMs) {
      return undecidedConsent;
    }
  }

  return {
    decided: true,
    analytics: record.analytics,
    marketing: record.marketing,
    updatedAt,
  };
}

export function serializeConsent(
  decision: ConsentDecision,
  updatedAt = new Date().toISOString(),
): string {
  return JSON.stringify({
    version: consentVersion,
    analytics: decision.analytics,
    marketing: decision.marketing,
    updatedAt,
  });
}

/** Compact server-readable cookie value: `analytics:marketing` as `1:0`. */
export function encodeConsentCookie(decision: ConsentDecision): string {
  return `${decision.analytics ? "1" : "0"}:${decision.marketing ? "1" : "0"}`;
}

export function parseConsentCookie(value: string | undefined | null): ConsentDecision | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const [analytics, marketing] = parts;
  if (analytics !== "0" && analytics !== "1") return null;
  if (marketing !== "0" && marketing !== "1") return null;
  return decisionFrom(analytics === "1", marketing === "1");
}

/**
 * The decision a fresh visitor gets. Both optional categories start denied so
 * nothing non-essential loads before the visitor acts.
 */
export function defaultDecision(): ConsentDecision {
  return decisionFrom(false, false);
}

export function withDecision(
  decision: ConsentDecision,
  updatedAt = new Date().toISOString(),
): ConsentState {
  return { decided: true, ...decision, updatedAt };
}
