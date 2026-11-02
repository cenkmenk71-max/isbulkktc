"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, BellOff, Loader2 } from "lucide-react";
import {
  getPushPreferenceState,
  removePushSubscription,
  savePushSubscription,
  type PushPreferenceState,
} from "@/features/pwa/actions";
import { urlBase64ToUint8Array } from "@/lib/pwa/web-push-client";
import { trackInstallEvent } from "@/lib/pwa/install-analytics";

type Props = {
  /** VAPID public key, or null when push is not configured on this deployment. */
  vapidPublicKey: string | null;
};

/**
 * Notification permission control.
 *
 * Three rules are enforced here rather than trusted to the caller:
 *
 *  - Permission is requested only from a click on this button, never on load.
 *    A permission prompt shown before the visitor has expressed intent is the
 *    main reason notification permission gets denied and then cannot be asked
 *    again.
 *  - The button explains the benefit before asking, and shows the current state
 *    afterwards (granted / denied / unsupported) so a visitor is never left
 *    guessing why nothing happened.
 *  - Subscribing is a two-step write: the browser subscription is created here
 *    and persisted server-side, so a failure to persist removes the browser
 *    subscription instead of leaving an orphan the server can never reach.
 */
export function PushPermissionControl({ vapidPublicKey }: Props) {
  const t = useTranslations("Install");
  const [state, setState] = useState<PushPreferenceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const browserPermission: PushPreferenceState["permission"] =
      typeof Notification === "undefined"
        ? "unsupported"
        : (Notification.permission as PushPreferenceState["permission"]);

    getPushPreferenceState()
      .then((next) => {
        if (!mounted.current) return;
        // The server knows the stored rows; the browser is the authority on the
        // permission itself. Merge the two, with the browser winning on
        // permission so a denied prompt is reported even if a stale row exists.
        setState({
          ...next,
          permission: next.supported ? browserPermission : "unsupported",
        });
      })
      .catch(() => {
        if (mounted.current) setState(null);
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const subscribe = useCallback(async () => {
    setError(null);
    if (!vapidPublicKey) {
      setError(t("pushNotConfigured"));
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setError(t("pushUnsupported"));
      return;
    }

    setBusy(true);
    trackInstallEvent("push_permission_requested");
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        trackInstallEvent("push_permission_denied");
        setState((prev) => (prev ? { ...prev, permission: "denied" } : prev));
        return;
      }
      if (permission !== "granted") return;
      trackInstallEvent("push_permission_granted");

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const result = await savePushSubscription(subscription.toJSON());
      if (!result.ok) {
        // The server could not store it, so it must not stay on the device
        // either — otherwise the browser reports "subscribed" forever while the
        // server has nothing to send to.
        if (!existing) await subscription.unsubscribe();
        setError(t("pushSaveFailed"));
        return;
      }

      trackInstallEvent("push_subscription_created");
      setState({
        permission: "granted",
        subscribed: true,
        preferences: null,
        supported: true,
      });
    } catch {
      setError(t("pushSaveFailed"));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [t, vapidPublicKey]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? null;
      if (subscription) await subscription.unsubscribe();
      const result = await removePushSubscription(endpoint);
      if (!result.ok) {
        setError(t("pushSaveFailed"));
        return;
      }
      trackInstallEvent("push_subscription_removed");
      setState((prev) => (prev ? { ...prev, subscribed: false } : prev));
    } catch {
      setError(t("pushSaveFailed"));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [t]);

  if (!vapidPublicKey) {
    return (
      <p className="pwa-push-note" data-push-state="unconfigured">
        {t("pushNotConfigured")}
      </p>
    );
  }

  if (!state) {
    return (
      <p className="pwa-push-note" data-push-state="loading">
        <Loader2 className="pwa-spin" aria-hidden="true" />
        {t("pushLoading")}
      </p>
    );
  }

  const unsupported = !state.supported;

  return (
    <div className="pwa-push" data-push-state={unsupported ? "unsupported" : state.permission}>
      <div className="pwa-push-copy">
        <p className="pwa-push-title">{t("pushTitle")}</p>
        <p className="pwa-push-body">{t("pushBody")}</p>
      </div>
      {unsupported ? (
        <p className="pwa-push-note">{t("pushUnsupported")}</p>
      ) : state.permission === "denied" ? (
        <p className="pwa-push-note" data-push-state="denied">
          {t("pushDenied")}
        </p>
      ) : (
        <button
          type="button"
          className="pwa-push-button"
          onClick={state.subscribed ? unsubscribe : subscribe}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="pwa-spin" aria-hidden="true" />
          ) : state.subscribed ? (
            <BellOff aria-hidden="true" />
          ) : (
            <Bell aria-hidden="true" />
          )}
          {state.subscribed ? t("pushDisable") : t("pushEnable")}
        </button>
      )}
      {error ? (
        <p className="pwa-push-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
