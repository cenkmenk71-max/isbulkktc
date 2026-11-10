import assert from "node:assert/strict";
import test from "node:test";

import {
  configureInstallTracking,
  isInstallTrackingEnabled,
  resetInstallTracking,
  trackInstallEvent,
  type InstallEventName,
  type InstallEventParams,
} from "../../src/lib/pwa/install-analytics";

/**
 * The install funnel is the one measurement path that is gated on consent *and*
 * carries a truthfulness contract: "the visitor accepted the install prompt" is
 * not "the app was installed", and the two must never be counted together. The
 * module shipped without coverage while its near-identical sibling
 * (`src/lib/analytics/conversion.ts`) had a full suite — this suite closes that
 * asymmetry.
 */

type Recorded = { event: InstallEventName; params: InstallEventParams };
type GtagCall = unknown[];

/**
 * Installs a fake `window` whose `gtag` records calls, plus a capturing
 * `onEvent` transport. Returns both recorders; the caller resets tracking.
 */
function withFakeBrowser(run: (calls: GtagCall[], events: Recorded[]) => void): void {
  const calls: GtagCall[] = [];
  const events: Recorded[] = [];
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    gtag: (...args: GtagCall) => calls.push(args),
  };
  try {
    run(calls, events);
  } finally {
    if (original === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = original;
    }
  }
}

function capture(events: Recorded[]) {
  return (event: InstallEventName, params: InstallEventParams) => {
    events.push({ event, params });
  };
}

test("nothing leaves the browser before analytics consent is granted", () => {
  resetInstallTracking();
  assert.equal(isInstallTrackingEnabled(), false);

  withFakeBrowser((calls, events) => {
    // No `configureInstallTracking` call has granted consent yet.
    trackInstallEvent("install_landing_view");
    trackInstallEvent("app_installed");
    assert.deepEqual(events, [], "the transport must not fire without consent");
    assert.equal(calls.length, 0, "gtag must not fire without consent");
  });
});

test("a granted event reaches both the transport and gtag", () => {
  withFakeBrowser((calls, events) => {
    configureInstallTracking({ analyticsConsent: true, onEvent: capture(events) });
    trackInstallEvent("install_prompt_available", { device: "mobile" });

    assert.deepEqual(events, [
      { event: "install_prompt_available", params: { device: "mobile", confidence: "inferred" } },
    ]);
    assert.deepEqual(calls, [
      ["event", "install_prompt_available", { device: "mobile", confidence: "inferred" }],
    ]);
  });
  resetInstallTracking();
});

test("withdrawing consent stops events immediately", () => {
  withFakeBrowser((calls, events) => {
    configureInstallTracking({ analyticsConsent: true, onEvent: capture(events) });
    trackInstallEvent("install_landing_view");
    configureInstallTracking({ analyticsConsent: false, onEvent: capture(events) });
    trackInstallEvent("install_landing_view");

    assert.equal(events.length, 1, "only the event made while consent held may be sent");
    assert.equal(calls.length, 1);
  });
  resetInstallTracking();
});

test("only app_installed and standalone_launch are marked confirmed", () => {
  withFakeBrowser((_calls, events) => {
    configureInstallTracking({ analyticsConsent: true, onEvent: capture(events) });
    // Confirmed: observed facts. An accepted prompt is a choice, not an install.
    trackInstallEvent("app_installed");
    trackInstallEvent("standalone_launch");
    // Inferred: a step the visitor took, which may not complete.
    trackInstallEvent("install_prompt_accepted");
    trackInstallEvent("install_prompt_dismissed");
    trackInstallEvent("push_permission_granted");

    assert.deepEqual(
      events.map((entry) => [entry.event, entry.params.confidence]),
      [
        ["app_installed", "confirmed"],
        ["standalone_launch", "confirmed"],
        ["install_prompt_accepted", "inferred"],
        ["install_prompt_dismissed", "inferred"],
        ["push_permission_granted", "inferred"],
      ],
    );
  });
  resetInstallTracking();
});

test("a caller cannot spoof the confidence field", () => {
  withFakeBrowser((_calls, events) => {
    configureInstallTracking({ analyticsConsent: true, onEvent: capture(events) });
    // A buggy or malicious call site must not be able to promote an inferred
    // event to "confirmed" by passing its own value.
    trackInstallEvent("install_prompt_accepted", { confidence: "confirmed" });
    trackInstallEvent("app_installed", { confidence: "inferred" });

    assert.equal(events[0].params.confidence, "inferred");
    assert.equal(events[1].params.confidence, "confirmed");
  });
  resetInstallTracking();
});

test("gtag is used as a fallback when no transport is configured", () => {
  withFakeBrowser((calls) => {
    configureInstallTracking({ analyticsConsent: true });
    trackInstallEvent("app_update_available");
    assert.deepEqual(calls, [
      ["event", "app_update_available", { confidence: "inferred" }],
    ]);
  });
  resetInstallTracking();
});

test("a later configure without onEvent clears a previously set transport", () => {
  withFakeBrowser((_calls, events) => {
    configureInstallTracking({ analyticsConsent: true, onEvent: capture(events) });
    trackInstallEvent("install_landing_view");
    // The runtime re-wires on a consent change; a stale transport must not linger.
    configureInstallTracking({ analyticsConsent: true });
    trackInstallEvent("install_landing_view");
    assert.equal(events.length, 1, "the transport is dropped once not re-supplied");
  });
  resetInstallTracking();
});

test("tracking outside a browser is a silent no-op", () => {
  resetInstallTracking();
  const original = (globalThis as { window?: unknown }).window;
  delete (globalThis as { window?: unknown }).window;
  try {
    configureInstallTracking({ analyticsConsent: true });
    assert.doesNotThrow(() => trackInstallEvent("install_landing_view"));
  } finally {
    if (original !== undefined) (globalThis as { window?: unknown }).window = original;
  }
  resetInstallTracking();
});
