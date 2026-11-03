import assert from "node:assert/strict";
import test from "node:test";

import {
  configureConversionTracking,
  isConversionTrackingEnabled,
  resetConversionTracking,
  trackConversion,
} from "../../src/lib/analytics/conversion";

type GtagCall = unknown[];

/** Installs a fake `window` with a capturing `gtag`, and removes it after. */
function withFakeWindow(run: (calls: GtagCall[]) => void): void {
  const calls: GtagCall[] = [];
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    gtag: (...args: GtagCall) => calls.push(args),
  };
  try {
    run(calls);
  } finally {
    if (original === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = original;
    }
  }
}

test("a conversion is a no-op until analytics consent is granted", () => {
  resetConversionTracking();
  assert.equal(isConversionTrackingEnabled(), false);

  withFakeWindow((calls) => {
    trackConversion("sign_up", { method: "email" });
    // Nothing may leave the browser before the visitor has agreed.
    assert.equal(calls.length, 0);
  });
});

test("a granted conversion reaches gtag with its name and params", () => {
  withFakeWindow((calls) => {
    configureConversionTracking({ analyticsConsent: true });
    trackConversion("apply_to_job", { job_id: "job-1" });

    assert.deepEqual(calls, [
      ["event", "apply_to_job", { job_id: "job-1" }],
    ]);
  });
  resetConversionTracking();
});

test("withdrawing consent stops conversions immediately", () => {
  withFakeWindow((calls) => {
    configureConversionTracking({ analyticsConsent: true });
    trackConversion("sales_lead");
    configureConversionTracking({ analyticsConsent: false });
    trackConversion("sales_lead");

    // Only the first call, made while consent held, may be sent.
    assert.equal(calls.length, 1);
  });
  resetConversionTracking();
});

test("an absent gtag is tolerated rather than thrown", () => {
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {};
  try {
    configureConversionTracking({ analyticsConsent: true });
    // The tag has not loaded yet on a first paint; this must not throw.
    assert.doesNotThrow(() => trackConversion("company_registered"));
  } finally {
    if (original === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = original;
    }
  }
  resetConversionTracking();
});
