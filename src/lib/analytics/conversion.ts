/**
 * Conversion instrumentation for the business events that matter.
 *
 * Google Analytics records page views on its own, which answers "how many
 * people looked" but not "how many people did the thing". The four events here
 * are the outcomes the site exists to produce — a candidate signs up, a
 * candidate applies, an employer registers a company, an employer asks for a
 * quote — so each is sent once, at the moment the server action reports
 * success, and each can be marked as a conversion in GA4.
 *
 * The transport is gated on the same `consent.analytics` flag that gates Google
 * Analytics: an unconsented call is a silent no-op. That keeps the privacy
 * promise intact — nothing leaves the browser until the visitor has agreed.
 *
 * These names match GA4's recommended event names where one exists (`sign_up`)
 * so the default reports pick them up; the rest are custom and have to be
 * marked as conversions explicitly (see docs/seo/MANUAL_TASKS.md).
 */

export type ConversionEventName =
  | "sign_up"
  | "apply_to_job"
  | "company_registered"
  | "sales_lead";

export type ConversionEventParams = Record<
  string,
  string | number | boolean | undefined
>;

let consentGranted = false;

/**
 * Wired once, from the consent context. Holding the flag here rather than
 * reading storage on every call means a consent withdrawal takes effect
 * immediately and cannot be raced by an in-flight submit.
 */
export function configureConversionTracking(options: {
  analyticsConsent: boolean;
}): void {
  consentGranted = options.analyticsConsent;
}

export function isConversionTrackingEnabled(): boolean {
  return consentGranted;
}

/**
 * Sends one conversion. A no-op without consent or outside a browser, so it is
 * safe to call from any client component's effect without a guard.
 */
export function trackConversion(
  event: ConversionEventName,
  params: ConversionEventParams = {},
): void {
  if (!consentGranted) return;
  if (typeof window === "undefined") return;

  // `gtag` is injected by the Google Analytics component and is only a function
  // once that component has run. Reading it through a local cast keeps this
  // module from re-declaring `Window.gtag` and colliding with the declaration
  // the analytics and install-tracking modules already own.
  const gtag = (window as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== "function") return;

  gtag("event", event, params);
}

/** Clears consent; used when the visitor withdraws it. */
export function resetConversionTracking(): void {
  consentGranted = false;
}
