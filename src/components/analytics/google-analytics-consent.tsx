"use client";

import Script from "next/script";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Cookie, ShieldCheck } from "lucide-react";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const consentStorageKey = "isbulkkktc-cookie-consent-v2";
const consentChangedEvent = "isbulkkktc:cookie-consent";

type ConsentCategories = { analytics: boolean; marketing: boolean };
type ConsentState = ConsentCategories & { decided: boolean };

const UNDECIDED: ConsentState = { decided: false, analytics: false, marketing: false };

function parseConsent(raw: string | null): ConsentState {
  if (!raw) return UNDECIDED;
  // The first banner stored a bare "granted"/"denied" string. Honour either as
  // a recorded decision so returning visitors do not see the notice again.
  if (raw === "granted") return { decided: true, analytics: true, marketing: false };
  if (raw === "denied") return { decided: true, analytics: false, marketing: false };
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentCategories>;
    return {
      decided: true,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
    };
  } catch {
    return UNDECIDED;
  }
}

// `useSyncExternalStore` compares snapshots by reference, so the parsed object
// is cached and only rebuilt when the stored string actually changes.
let cachedRaw: string | null = null;
let cachedState: ConsentState = UNDECIDED;
function getStableSnapshot(): ConsentState {
  const raw = window.localStorage.getItem(consentStorageKey);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parseConsent(raw);
  }
  return cachedState;
}

function subscribeToConsent(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(consentChangedEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(consentChangedEvent, onChange);
  };
}

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

function ConsentSwitch({
  id,
  label,
  description,
  checked,
  onLabel,
  offLabel,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onLabel: string;
  offLabel: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="consent-category">
      <div className="consent-category-copy">
        <span id={`${id}-label`} className="consent-category-label">
          {label}
        </span>
        <p className="consent-category-description">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        className="consent-switch"
        onClick={() => onChange(!checked)}
      >
        <span className="consent-switch-track" aria-hidden="true">
          <span className="consent-switch-thumb" />
        </span>
        <span className="consent-switch-state">{checked ? onLabel : offLabel}</span>
      </button>
    </div>
  );
}

export function GoogleAnalyticsConsent() {
  const pathname = usePathname();
  const t = useTranslations("Analytics");
  const consent = useSyncExternalStore(
    subscribeToConsent,
    getStableSnapshot,
    () => UNDECIDED,
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState<ConsentCategories>({
    analytics: false,
    marketing: false,
  });
  const [scriptReady, setScriptReady] = useState(false);

  const analyticsConfigured =
    Boolean(measurementId) && /^G-[A-Z0-9]+$/.test(measurementId ?? "");

  useEffect(() => {
    if (
      !consent.analytics ||
      !analyticsConfigured ||
      !scriptReady ||
      typeof window.gtag !== "function"
    ) {
      return;
    }
    window.gtag("event", "page_view", {
      page_path: window.location.pathname,
      page_title: document.title,
    });
  }, [consent.analytics, analyticsConfigured, pathname, scriptReady]);

  function persist(next: ConsentCategories) {
    window.localStorage.setItem(consentStorageKey, JSON.stringify(next));
    window[`ga-disable-${measurementId}`] = !next.analytics;
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: next.analytics ? "granted" : "denied",
        ad_storage: next.marketing ? "granted" : "denied",
        ad_user_data: next.marketing ? "granted" : "denied",
        ad_personalization: next.marketing ? "granted" : "denied",
      });
    }
    setScriptReady(false);
    window.dispatchEvent(new Event(consentChangedEvent));
  }

  function decide(next: ConsentCategories) {
    persist(next);
    setPanelOpen(false);
  }

  function openPanel() {
    setDraft({ analytics: consent.analytics, marketing: consent.marketing });
    setPanelOpen(true);
  }

  const showNotice = !consent.decided || panelOpen;

  return (
    <>
      {analyticsConfigured && consent.analytics && (
        <>
          <Script
            id="google-analytics-init"
            strategy="afterInteractive"
            onReady={() => setScriptReady(true)}
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});window.gtag('js',new Date());window.gtag('config','${measurementId}',{send_page_view:false});`,
            }}
          />
          <Script
            id="google-analytics"
            src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
            strategy="afterInteractive"
          />
        </>
      )}

      {showNotice && (
        <section
          className="consent-card"
          role="dialog"
          aria-modal="false"
          aria-labelledby="consent-card-title"
          aria-live="polite"
        >
          <header className="consent-card-header">
            <span className="consent-card-mark" aria-hidden="true">
              <Cookie size={18} />
            </span>
            <div>
              <h2 id="consent-card-title">{t("title")}</h2>
              <p>{t("description")}</p>
            </div>
          </header>

          <div className="consent-categories">
            <div className="consent-category">
              <div className="consent-category-copy">
                <span className="consent-category-label">
                  <ShieldCheck size={13} aria-hidden="true" />
                  {t("necessaryLabel")}
                </span>
                <p className="consent-category-description">
                  {t("necessaryDescription")}
                </p>
              </div>
              <span className="consent-locked">{t("alwaysOn")}</span>
            </div>

            <ConsentSwitch
              id="consent-analytics"
              label={t("analyticsLabel")}
              description={t("analyticsDescription")}
              checked={draft.analytics}
              onLabel={t("stateOn")}
              offLabel={t("stateOff")}
              onChange={(next) => setDraft((d) => ({ ...d, analytics: next }))}
            />
            <ConsentSwitch
              id="consent-marketing"
              label={t("marketingLabel")}
              description={t("marketingDescription")}
              checked={draft.marketing}
              onLabel={t("stateOn")}
              offLabel={t("stateOff")}
              onChange={(next) => setDraft((d) => ({ ...d, marketing: next }))}
            />
          </div>

          <div className="consent-card-actions">
            <button
              type="button"
              className="consent-btn consent-btn-ghost"
              onClick={() => decide({ analytics: false, marketing: false })}
            >
              {t("rejectAll")}
            </button>
            <button
              type="button"
              className="consent-btn consent-btn-ghost"
              onClick={() => decide(draft)}
            >
              {t("savePreferences")}
            </button>
            <button
              type="button"
              className="consent-btn consent-btn-primary"
              onClick={() => decide({ analytics: true, marketing: true })}
            >
              {t("acceptAll")}
            </button>
          </div>

          <footer className="consent-card-footer">
            <Link className="consent-policy-link" href="/cookies">
              {t("policyLink")}
            </Link>
            {consent.decided && (
              <button
                type="button"
                className="consent-close"
                onClick={() => setPanelOpen(false)}
              >
                {t("close")}
              </button>
            )}
          </footer>
        </section>
      )}

      {consent.decided && !panelOpen && (
        <button
          type="button"
          className="consent-settings-trigger"
          onClick={openPanel}
        >
          <Cookie size={13} aria-hidden="true" />
          {t("settings")}
        </button>
      )}
    </>
  );
}
