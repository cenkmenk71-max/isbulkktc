"use client";

import { useEffect, useRef } from "react";
import {
  trackConversion,
  type ConversionEventName,
  type ConversionEventParams,
} from "./conversion";

/**
 * Fires a conversion the first time a form's server action reports success.
 *
 * The forms already surface `state.status === "success"`, so this needs no
 * change to the actions: the moment the state flips, the event is sent. The ref
 * guard keeps a re-render (or a second identical success) from double-counting
 * the same submission.
 */
export function useTrackConversionOnSuccess(
  status: string,
  event: ConversionEventName,
  params: ConversionEventParams = {},
): void {
  const fired = useRef(false);

  useEffect(() => {
    if (status !== "success" || fired.current) return;
    fired.current = true;
    trackConversion(event, params);
  }, [status, event, params]);
}

/**
 * Reports a conversion only when the named URL marker is present, then strips
 * it.
 *
 * Two flows cannot use the success-state hook because the server action ends in
 * a `redirect`, so the form never sees a success state: a new account created
 * through an OAuth provider or a confirmation link, and a newly registered
 * company. Both land on a dashboard, so the redirect carries a marker
 * (`?signup=1`, `?created=1`) and the dashboard always mounts this. The
 * component decides from `window.location` on the client, reports once, and
 * removes the marker with `history.replaceState` so a refresh or a shared URL
 * cannot re-report it.
 */
export function MarkerConversion({
  marker,
  event,
  params = {},
}: {
  marker: string;
  event: ConversionEventName;
  params?: ConversionEventParams;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const url = new URL(window.location.href);
    if (!url.searchParams.has(marker)) return;

    trackConversion(event, params);
    url.searchParams.delete(marker);
    window.history.replaceState(window.history.state, "", url.toString());
    // Runs once per mount by design; the marker is consumed above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
