"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Check,
  Compass,
  Download,
  MoreVertical,
  Share,
  Smartphone,
  SquarePlus,
  TriangleAlert,
} from "lucide-react";
import {
  consumeInstallPrompt,
  rememberInstallDismissal,
  useInstallPrompt,
} from "@/lib/pwa/install-prompt";
import {
  getInstallEnvironmentSnapshot,
  getServerInstallEnvironmentSnapshot,
  subscribeInstallEnvironment,
  type PlatformSnapshot,
} from "@/lib/pwa/platform";
import { trackInstallEvent } from "@/lib/pwa/install-analytics";
import type { InstallCampaign } from "@/lib/pwa/campaign";
import { PushPermissionControl } from "@/components/pwa/push-permission-control";

type Props = {
  destination: string;
  destinationWasRequested: boolean;
  campaign: InstallCampaign | null;
  vapidPublicKey: string | null;
  locale: string;
  copy: { title: string };
};

/**
 * The install journey.
 *
 * The shape of this component follows one rule: the platform's real capability
 * decides what is shown, and the visitor can always continue into the app. There
 * is no "install succeeded" state that is not backed by an OS signal — an
 * accepted prompt on Android shows "installing…" and waits for `appinstalled`,
 * while on iOS the instructions end with a manual "I've added it" that only
 * navigates, never claims success.
 *
 * `useInstallPrompt` is a `useSyncExternalStore` subscription, so a
 * `beforeinstallprompt` that fired on a previous page (the visitor landed on the
 * home page first) is still available here.
 */
export function InstallExperience({
  destination,
  destinationWasRequested,
  campaign,
  vapidPublicKey,
  copy,
}: Props) {
  const t = useTranslations("Install");
  const prompt = useInstallPrompt();
  // `useSyncExternalStore` gives a server snapshot of `platform: null`, so the
  // markup is identical on both sides and no state is set from an effect.
  const environment = useSyncExternalStore(
    subscribeInstallEnvironment,
    getInstallEnvironmentSnapshot,
    getServerInstallEnvironmentSnapshot,
  );
  const platform = environment.platform;
  const [status, setStatus] = useState<"idle" | "prompting" | "accepted" | "dismissed">("idle");

  useEffect(() => {
    if (!platform) return;
    trackInstallEvent("install_landing_view", {
      device: platform.family === "desktop" ? "desktop" : "mobile",
    });
    if (platform.isStandalone) trackInstallEvent("standalone_launch");
  }, [platform]);

  // The page cannot know the device until the client snapshot exists, and a
  // wrong instruction is worse than a brief placeholder.
  const ready = platform !== null;
  const installed = platform?.isStandalone ?? false;
  const dismissedBefore = environment.installDismissedBefore;

  const handleAndroidInstall = useCallback(async () => {
    const event = consumeInstallPrompt();
    if (!event) return;
    setStatus("prompting");
    trackInstallEvent("install_prompt_shown");
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        // Not "installed": a WebAPK install can still fail after acceptance, and
        // the only confirmation is the `appinstalled` event the runtime listens
        // for. So this reports the choice and waits.
        setStatus("accepted");
        trackInstallEvent("install_prompt_accepted");
      } else {
        setStatus("dismissed");
        rememberInstallDismissal();
        trackInstallEvent("install_prompt_dismissed");
      }
    } catch {
      // A spent or rejected prompt leaves the manual path visible below.
      setStatus("dismissed");
    }
  }, []);

  const handleIosInstructions = useCallback(() => {
    trackInstallEvent("install_instructions_viewed");
  }, []);

  const campaignLabel = useMemo(() => {
    if (!campaign) return null;
    return campaign.name ?? campaign.source ?? campaign.id;
  }, [campaign]);

  return (
    <div className="pwa-install-page" data-platform={platform?.family ?? "unknown"}>
      <div className="pwa-install-card">
        <p className="pwa-install-eyebrow">
          <Smartphone aria-hidden="true" />
          {t("eyebrow")}
        </p>
        <h1 className="pwa-install-title">{copy.title}</h1>
        <p className="pwa-install-lede">{t("lede")}</p>

        {campaignLabel ? (
          <p className="pwa-install-campaign" data-campaign={campaignLabel}>
            {t("campaignNote", { campaign: campaignLabel })}
          </p>
        ) : null}

        {!ready ? (
          <p className="pwa-install-status" data-state="detecting">
            {t("detecting")}
          </p>
        ) : installed ? (
          <div className="pwa-install-block" data-state="installed">
            <p className="pwa-install-status">
              <Check aria-hidden="true" />
              {t("alreadyInstalled")}
            </p>
            <InstallDestinationLink
              destination={destination}
              wasRequested={destinationWasRequested}
              label={t("continueToApp")}
            />
          </div>
        ) : platform.family === "android" ? (
          <AndroidJourney
            hasPrompt={prompt !== null}
            dismissedBefore={dismissedBefore}
            status={status}
            onInstall={handleAndroidInstall}
            destination={destination}
            destinationWasRequested={destinationWasRequested}
          />
        ) : platform.isIos ? (
          <IosJourney
            variant={platform.iosBrowser}
            onReveal={handleIosInstructions}
            destination={destination}
            destinationWasRequested={destinationWasRequested}
          />
        ) : (
          <DesktopJourney
            hasPrompt={prompt !== null}
            status={status}
            onInstall={handleAndroidInstall}
            destination={destination}
            destinationWasRequested={destinationWasRequested}
          />
        )}

        {ready && !installed ? (
          <div className="pwa-install-push">
            <PushPermissionControl vapidPublicKey={vapidPublicKey} />
          </div>
        ) : null}

        <p className="pwa-install-footnote">{t("footnote")}</p>
      </div>
    </div>
  );
}

function InstallDestinationLink({
  destination,
  wasRequested,
  label,
}: {
  destination: string;
  wasRequested: boolean;
  label: string;
}) {
  const t = useTranslations("Install");
  return (
    <div className="pwa-install-continue">
      <Link
        href={destination}
        className="pwa-install-primary"
        onClick={() => trackInstallEvent("install_manual_continue", { requested: wasRequested })}
      >
        {label}
        <ArrowRight aria-hidden="true" />
      </Link>
      <p className="pwa-install-continue-note">{t("continueNote")}</p>
    </div>
  );
}

function AndroidJourney({
  hasPrompt,
  dismissedBefore,
  status,
  onInstall,
  destination,
  destinationWasRequested,
}: {
  hasPrompt: boolean;
  dismissedBefore: boolean;
  status: "idle" | "prompting" | "accepted" | "dismissed";
  onInstall: () => void;
  destination: string;
  destinationWasRequested: boolean;
}) {
  const t = useTranslations("Install");

  return (
    <div className="pwa-install-block" data-state="android">
      {status === "accepted" ? (
        <p className="pwa-install-status" data-state="accepted">
          <Check aria-hidden="true" />
          {t("androidAccepted")}
        </p>
      ) : null}

      {hasPrompt ? (
        <button
          type="button"
          className="pwa-install-primary"
          onClick={onInstall}
          disabled={status === "prompting"}
        >
          <Download aria-hidden="true" />
          {dismissedBefore ? t("androidInstallAgain") : t("androidInstall")}
        </button>
      ) : (
        <div className="pwa-install-fallback" data-state="manual">
          <p className="pwa-install-fallback-title">
            <TriangleAlert aria-hidden="true" />
            {t("androidManualTitle")}
          </p>
          <ol className="pwa-install-steps">
            <li>{t("androidManualStep1")}</li>
            <li>{t("androidManualStep2")}</li>
            <li>{t("androidManualStep3")}</li>
          </ol>
        </div>
      )}

      <InstallDestinationLink
        destination={destination}
        wasRequested={destinationWasRequested}
        label={t("continueToApp")}
      />
    </div>
  );
}

function IosJourney({
  variant,
  onReveal,
  destination,
  destinationWasRequested,
}: {
  variant: PlatformSnapshot["iosBrowser"];
  onReveal: () => void;
  destination: string;
  destinationWasRequested: boolean;
}) {
  const t = useTranslations("Install");
  const [expanded, setExpanded] = useState(false);

  // The instructions differ per browser because the toolbar differs per browser.
  // An in-app web view (an Instagram or Messenger link, typically) cannot add to
  // the home screen at all, so the only correct advice is to leave it.
  const body =
    variant === "safari"
      ? {
          intro: t("iosSafariIntro"),
          steps: [t("iosStepShare"), t("iosStepAdd"), t("iosStepConfirm")],
          icons: [<Share key="share" aria-hidden="true" />, <SquarePlus key="add" aria-hidden="true" />],
        }
      : variant === "third-party"
        ? {
            intro: t("iosThirdPartyIntro"),
            steps: [t("iosStepOpenSafari"), t("iosStepShare"), t("iosStepAdd")],
            icons: [<Compass key="compass" aria-hidden="true" />, <Share key="share" aria-hidden="true" />],
          }
        : {
            intro: t("iosInAppIntro"),
            steps: [t("iosStepOpenExternal"), t("iosStepShare"), t("iosStepAdd")],
            icons: [<MoreVertical key="more" aria-hidden="true" />, <Share key="share" aria-hidden="true" />],
          };

  return (
    <div className="pwa-install-block" data-state="ios" data-browser={variant}>
      <p className="pwa-install-fallback-title">{body.intro}</p>
      <button
        type="button"
        className="pwa-install-secondary"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(true);
          onReveal();
        }}
      >
        {t("iosShowSteps")}
      </button>

      {expanded ? (
        <ol className="pwa-install-steps" data-state="ios-steps">
          {body.steps.map((step, index) => (
            <li key={step}>
              <span className="pwa-install-step-icon">{body.icons[index] ?? null}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {/* Deliberately "continue", never "installed": iOS gives the page no way
          to observe that the home-screen icon was actually added. */}
      <InstallDestinationLink
        destination={destination}
        wasRequested={destinationWasRequested}
        label={t("continueToApp")}
      />
    </div>
  );
}

function DesktopJourney({
  hasPrompt,
  status,
  onInstall,
  destination,
  destinationWasRequested,
}: {
  hasPrompt: boolean;
  status: "idle" | "prompting" | "accepted" | "dismissed";
  onInstall: () => void;
  destination: string;
  destinationWasRequested: boolean;
}) {
  const t = useTranslations("Install");

  return (
    <div className="pwa-install-block" data-state="desktop">
      {status === "accepted" ? (
        <p className="pwa-install-status" data-state="accepted">
          <Check aria-hidden="true" />
          {t("desktopAccepted")}
        </p>
      ) : null}
      {hasPrompt ? (
        <button
          type="button"
          className="pwa-install-primary"
          onClick={onInstall}
          disabled={status === "prompting"}
        >
          <Download aria-hidden="true" />
          {t("desktopInstall")}
        </button>
      ) : (
        <p className="pwa-install-status">{t("desktopUnavailable")}</p>
      )}
      <InstallDestinationLink
        destination={destination}
        wasRequested={destinationWasRequested}
        label={t("continueToApp")}
      />
    </div>
  );
}
