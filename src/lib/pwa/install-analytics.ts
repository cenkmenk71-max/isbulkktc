/**
 * Installation funnel instrumentation.
 *
 * Two rules shape this module:
 *
 * 1. Nothing is sent without analytics consent. The site already has a consent
 *    model, and an install funnel is exactly the kind of measurement that model
 *    exists for, so the transport is gated on the same `consent.analytics` flag
 *    that gates Google Analytics. Without consent, calls are silent no-ops.
 *
 * 2. Confirmed and inferred events are different events. "The visitor accepted
 *    the install prompt" is not "the app was installed": a WebAPK can still fail
 *    to install, and on iOS there is no prompt at all. The `confidence` field
 *    carries that distinction so a dashboard can never quietly count an
 *    accepted prompt as an installation. Only `appinstalled` (Android/desktop
 *    Chromium) and a `display-mode: standalone` launch (all platforms) are
 *    confirmed.
 */

export type InstallEventName =
  | "install_landing_view"
  | "install_prompt_available"
  | "install_prompt_shown"
  | "install_prompt_accepted"
  | "install_prompt_dismissed"
  | "install_instructions_viewed"
  | "install_manual_continue"
  | "app_installed"
  | "standalone_launch"
  | "push_permission_requested"
  | "push_permission_granted"
  | "push_permission_denied"
  | "push_subscription_created"
  | "push_subscription_removed"
  | "offline_fallback_used"
  | "app_update_available"
  | "app_update_applied";

/** Events that are observed facts rather than a step the visitor took. */
const confirmedEvents = new Set<InstallEventName>(["app_installed", "standalone_launch"]);

export type InstallEventParams = Record<string, string | number | boolean | undefined>;

type Transport = (event: InstallEventName, params: InstallEventParams) => void;

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
  }
}

let consentGranted = false;
let transport: Transport | null = null;

/**
 * Wired once by `PwaRuntime` from the consent context. Keeping the flag here
 * (rather than reading storage on every call) means a consent withdrawal takes
 * effect immediately and cannot be raced.
 */
export function configureInstallTracking(options: {
  analyticsConsent: boolean;
  onEvent?: Transport;
}): void {
  consentGranted = options.analyticsConsent;
  transport = options.onEvent ?? null;
}

export function isInstallTrackingEnabled(): boolean {
  return consentGranted;
}

export function trackInstallEvent(
  event: InstallEventName,
  params: InstallEventParams = {},
): void {
  if (!consentGranted || typeof window === "undefined") return;

  const payload: InstallEventParams = {
    ...params,
    confidence: confirmedEvents.has(event) ? "confirmed" : "inferred",
  };

  transport?.(event, payload);

  if (typeof window.gtag === "function") {
    window.gtag("event", event, payload);
  }
}

/** Clears the transport; used when consent is withdrawn. */
export function resetInstallTracking(): void {
  consentGranted = false;
}
