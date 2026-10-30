"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Cookie, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  consentCategories,
  defaultDecision,
  type ConsentCategory,
  type ConsentDecision,
} from "./consent";
import { useConsent } from "./consent-context";

type PolicySection = { title: string; paragraphs: string[] };

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

export function CookieConsent() {
  const t = useTranslations("Analytics");
  const legal = useTranslations("Legal");
  const { mounted, consent, panelOpen, save, reset, openPanel, closePanel } =
    useConsent();
  const [policyOpen, setPolicyOpen] = useState(false);
  const [draft, setDraft] = useState<ConsentDecision>(defaultDecision);
  const [wasOpen, setWasOpen] = useState(panelOpen);
  const cardRef = useRef<HTMLElement | null>(null);

  // Seed the draft from the stored decision each time the panel opens, using
  // the "adjust state during render" pattern instead of an effect (an effect
  // would schedule a second render and trip `set-state-in-effect`).
  if (panelOpen !== wasOpen) {
    setWasOpen(panelOpen);
    if (panelOpen) {
      setDraft({ analytics: consent.analytics, marketing: consent.marketing });
    }
  }

  // The policy is read from the legal catalogue so the inline card and the
  // `/cookies` page can never drift apart.
  const policySections: PolicySection[] = (["s1", "s2", "s3"] as const).map(
    (key) => ({
      title: legal(`cookies.sections.${key}.title`),
      paragraphs:
        key === "s1"
          ? [legal(`cookies.sections.${key}.p1`)]
          : [legal(`cookies.sections.${key}.p1`), legal(`cookies.sections.${key}.p2`)],
    }),
  );

  // Move focus into the panel only when it was opened deliberately (settings),
  // never on the first automatic appearance — stealing focus on load is hostile.
  useEffect(() => {
    if (panelOpen) {
      cardRef.current?.focus();
    }
  }, [panelOpen]);

  // Escape closes a reopened panel; the first, undecided notice has no dismiss
  // affordance so a choice is always made explicitly.
  useEffect(() => {
    if (!panelOpen || !consent.decided) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPolicyOpen(false);
        closePanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelOpen, consent.decided, closePanel]);

  // Nothing renders until the client has hydrated and read storage: rendering
  // the notice from a server guess made it flash for visitors who had already
  // decided (and shifted the layout).
  const showNotice = mounted && (!consent.decided || panelOpen);
  const showTrigger = mounted && consent.decided && !panelOpen;

  const categoryCopy: Record<ConsentCategory, { label: string; description: string }> = {
    analytics: {
      label: t("analyticsLabel"),
      description: t("analyticsDescription"),
    },
    marketing: {
      label: t("marketingLabel"),
      description: t("marketingDescription"),
    },
  };

  return (
    <>
      {showNotice && (
        <section
          ref={cardRef}
          className="consent-card"
          role="dialog"
          aria-modal="false"
          aria-labelledby="consent-card-title"
          aria-describedby="consent-card-description"
          tabIndex={-1}
        >
          <header className="consent-card-header">
            <span className="consent-card-mark" aria-hidden="true">
              <Cookie size={18} />
            </span>
            <div>
              <h2 id="consent-card-title">{t("title")}</h2>
              <p id="consent-card-description">{t("description")}</p>
            </div>
          </header>

          {policyOpen ? (
            <div className="consent-policy-panel">
              <h3 className="consent-policy-title">{legal("cookies.title")}</h3>
              <p className="consent-policy-updated">
                {legal("lastUpdated", { date: legal("cookies.updated") })}
              </p>
              {policySections.map((section) => (
                <section key={section.title}>
                  <h4 className="consent-policy-section-title">{section.title}</h4>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="consent-policy-paragraph">
                      {paragraph}
                    </p>
                  ))}
                </section>
              ))}
              <Link className="consent-policy-full-link" href="/cookies">
                {t("openFullPolicy")}
              </Link>
            </div>
          ) : (
            <>
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

                {consentCategories.map((category) => (
                  <ConsentSwitch
                    key={category}
                    id={`consent-${category}`}
                    label={categoryCopy[category].label}
                    description={categoryCopy[category].description}
                    checked={draft[category]}
                    onLabel={t("stateOn")}
                    offLabel={t("stateOff")}
                    onChange={(next) =>
                      setDraft((current) => ({ ...current, [category]: next }))
                    }
                  />
                ))}
              </div>

              <div className="consent-card-actions">
                <button
                  type="button"
                  className="consent-btn"
                  onClick={() => save(defaultDecision())}
                >
                  {t("rejectAll")}
                </button>
                <button
                  type="button"
                  className="consent-btn"
                  onClick={() => save(draft)}
                >
                  {t("savePreferences")}
                </button>
                <button
                  type="button"
                  className="consent-btn"
                  onClick={() => save({ analytics: true, marketing: true })}
                >
                  {t("acceptAll")}
                </button>
              </div>
            </>
          )}

          <footer className="consent-card-footer">
            {policyOpen ? (
              <button
                type="button"
                className="consent-policy-link"
                onClick={() => setPolicyOpen(false)}
              >
                {t("backToPreferences")}
              </button>
            ) : (
              <button
                type="button"
                className="consent-policy-link"
                onClick={() => setPolicyOpen(true)}
              >
                {t("policyLink")}
              </button>
            )}
            <span className="consent-card-footer-actions">
              <Link className="consent-policy-link" href="/privacy">
                {t("privacyLink")}
              </Link>
              {consent.decided ? (
                <>
                  <button
                    type="button"
                    className="consent-policy-link"
                    onClick={reset}
                  >
                    {t("withdraw")}
                  </button>
                  <button
                    type="button"
                    className="consent-close"
                    onClick={() => {
                      setPolicyOpen(false);
                      closePanel();
                    }}
                  >
                    {t("close")}
                  </button>
                </>
              ) : null}
            </span>
          </footer>
        </section>
      )}

      {showTrigger && (
        <button type="button" className="consent-settings-trigger" onClick={openPanel}>
          <Cookie size={13} aria-hidden="true" />
          {t("settings")}
        </button>
      )}
    </>
  );
}
