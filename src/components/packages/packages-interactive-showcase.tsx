"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "@/experience/scenes/vend-pricing/components/Panel";
import type { SceneLabels } from "@/experience/scenes/vend-pricing/lib/labels";
import type { ListingDuration, Plan } from "@/experience/scenes/vend-pricing/lib/plans";
import { unlockAudio } from "@/experience/scenes/vend-pricing/lib/sfx";
import type { Frame } from "@/experience/scenes/vend-pricing/lib/timeline";
import type { VendControls } from "@/experience/scenes/vend-pricing/vend-machine";

const VendMachine = dynamic(
  () => import("@/experience/scenes/vend-pricing/vend-machine"),
  { ssr: false },
);

type PackageProfile = {
  id: "singleListing" | "growth" | "professional" | "enterprise";
  color: string;
  listingCount: number | null;
  prices: Record<ListingDuration, number> | null;
  title: string;
  audience: string;
  summary: string;
  terms: string[];
};

type PackagesInteractiveShowcaseProps = {
  profiles: PackageProfile[];
  title: string;
  instruction: string;
  brand: string;
  platformLabel: string;
  labelCopy: SceneLabels;
  packageStatus: string;
  selectLabel: string;
  packageContentsLabel: string;
  durationLabel: string;
  durationGroupLabel: string;
  durationOptions: { days: ListingDuration; label: string }[];
  priceSummary: string;
  customPriceLabel: string;
  priceDisclaimer: string;
  quoteAction: string;
  quoteTitle: string;
  quoteInstructions: string;
  quoteUnavailable: string;
  quoteEmailSubject: string;
  quoteEmailBody: string;
  salesContactEmail: string;
  fallbackMessage: string;
  ctaTitle: string;
  ctaLabel: string;
  backLabel: string;
  soundLabels: { button: string; effects: string; rain: string; off: string };
};

export function PackagesInteractiveShowcase({
  profiles,
  title,
  instruction,
  brand,
  platformLabel,
  labelCopy,
  packageStatus,
  selectLabel,
  packageContentsLabel,
  durationLabel,
  durationGroupLabel,
  durationOptions,
  priceSummary,
  customPriceLabel,
  priceDisclaimer,
  quoteAction,
  quoteTitle,
  quoteInstructions,
  quoteUnavailable,
  quoteEmailSubject,
  quoteEmailBody,
  salesContactEmail,
  fallbackMessage,
  ctaTitle,
  ctaLabel,
  backLabel,
  soundLabels,
}: PackagesInteractiveShowcaseProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState<ListingDuration>(30);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sceneStarted, setSceneStarted] = useState(true);
  const [sceneVisible, setSceneVisible] = useState(true);
  const [sceneUnavailable, setSceneUnavailable] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const controlsRef = useRef<VendControls | null>(null);
  const pendingPress = useRef<number | null>(null);
  const pendingCoin = useRef(false);
  const packageControlRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const frameDomState = useRef<{
    panel: number;
    shown: boolean;
    open: boolean;
    zoomed: boolean;
    canPhase: string;
    coinPhase: string;
  } | null>(null);
  const selectedRef = useRef(selectedIndex);
  const panelOpenRef = useRef(panelOpen);

  const plans = useMemo<Plan[]>(
    () =>
      profiles.map((profile) => ({
        id: profile.id,
        name: profile.title,
        audience: profile.audience,
        blurb: profile.summary,
        features: profile.terms,
        color: profile.color,
        listingCount: profile.listingCount,
        prices: profile.prices,
      })),
    [profiles],
  );

  useEffect(() => {
    setSceneStarted(true);
    const stage = stageRef.current;
    if (!stage) return;
    if (!("IntersectionObserver" in window)) {
      const frame = requestAnimationFrame(() => {
        setSceneVisible(true);
      });
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setSceneVisible(entry.isIntersecting);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const onMachineReady = useCallback((controls: VendControls | null) => {
    controlsRef.current = controls;
    if (controls && pendingPress.current !== null) {
      controls.press(pendingPress.current);
      pendingPress.current = null;
    }
    if (controls && pendingCoin.current) {
      controls.insertCoin();
      pendingCoin.current = false;
    }
  }, []);

  const onSceneUnavailable = useCallback(() => {
    setSceneUnavailable(true);
  }, []);

  const onSceneFrame = useCallback((
    frame: Frame,
    isTouring: boolean,
  ) => {
    const stage = stageRef.current;
    const panelProgress = frame.panel;
    const isOpen = frame.panel > 0.5;
    const canPhase = frame.can.visible
      ? frame.can.fall > 0 && frame.can.fall < 1
        ? "falling"
        : frame.can.fall >= 1
          ? "tray"
          : "queued"
      : "idle";
    const coinPhase = frame.coin >= 0 ? "falling" : "idle";
    if (stage) {
      const previous = frameDomState.current;
      const shown = panelProgress > 0;
      const zoomed = frame.dolly > 0.5;
      if (!previous || Math.abs(previous.panel - panelProgress) >= 0.001) {
        stage.style.setProperty("--vend-p", panelProgress.toFixed(4));
      }
      if (!previous || previous.shown !== shown) {
        stage.toggleAttribute("data-shown", shown);
      }
      if (!previous || previous.open !== isOpen) {
        stage.toggleAttribute("data-open", isOpen);
      }
      if (!previous || previous.zoomed !== zoomed) {
        stage.toggleAttribute("data-zoomed", zoomed);
      }
      if (!previous || previous.canPhase !== canPhase) {
        stage.setAttribute("data-can-phase", canPhase);
      }
      if (!previous || previous.coinPhase !== coinPhase) {
        stage.setAttribute("data-coin-phase", coinPhase);
      }
      frameDomState.current = {
        panel: panelProgress,
        shown,
        open: isOpen,
        zoomed,
        canPhase,
        coinPhase,
      };
    }

    if (
      frame.tier >= 0 &&
      frame.tier !== selectedRef.current
    ) {
      selectedRef.current = frame.tier;
      setSelectedIndex(frame.tier);
    }
    if (isOpen !== panelOpenRef.current) {
      const wasOpen = panelOpenRef.current;
      panelOpenRef.current = isOpen;
      setPanelOpen(isOpen);
      if (!isTouring && isOpen && !wasOpen) {
        headingRef.current?.focus({ preventScroll: true });
      }
      if (!isTouring && !isOpen && wasOpen) {
        packageControlRefs.current[selectedRef.current]?.focus({ preventScroll: true });
      }
    }
  }, []);

  const onMachineSelect = useCallback((index: number) => {
    selectedRef.current = index;
    setSelectedIndex(index);
    if (controlsRef.current) controlsRef.current.press(index);
    else pendingPress.current = index;
  }, []);

  const onFogWipe = useCallback(() => {
    stageRef.current?.toggleAttribute("data-fog-wiped", true);
  }, []);

  const selectPackage = (index: number) => {
    if (!sceneUnavailable) unlockAudio();
    selectedRef.current = index;
    setSelectedIndex(index);
    if (sceneUnavailable) {
      panelOpenRef.current = true;
      stageRef.current?.style.setProperty("--vend-p", "1");
      stageRef.current?.toggleAttribute("data-shown", true);
      stageRef.current?.toggleAttribute("data-open", true);
      setPanelOpen(true);
    } else {
      if (controlsRef.current) controlsRef.current.press(index);
      else pendingPress.current = index;
    }
  };

  const insertCoin = () => {
    if (!sceneUnavailable) unlockAudio();
    setSelectedDuration((current) => {
      const index = durationOptions.findIndex((option) => option.days === current);
      const next = durationOptions[(index + 1) % durationOptions.length];
      return next?.days ?? current;
    });
    if (sceneUnavailable) return;
    if (controlsRef.current) controlsRef.current.insertCoin();
    else pendingCoin.current = true;
  };

  const closePanel = () => {
    if (controlsRef.current) {
      controlsRef.current.close();
      return;
    }
    panelOpenRef.current = false;
    stageRef.current?.style.setProperty("--vend-p", "0");
    stageRef.current?.toggleAttribute("data-shown", false);
    stageRef.current?.toggleAttribute("data-open", false);
    setPanelOpen(false);
  };

  return (
    <div className="packages-vend-experience">
      <div
        className="packages-vend-stage"
        data-duration={selectedDuration}
        data-selected-package={profiles[selectedIndex].id}
        data-scene-visible={sceneVisible ? "" : undefined}
        ref={stageRef}
      >
        {sceneStarted && !sceneUnavailable && (
          <VendMachine
            onFrame={onSceneFrame}
            onReady={onMachineReady}
            onCoin={insertCoin}
            onSelect={onMachineSelect}
            onWipe={onFogWipe}
            onUnavailable={onSceneUnavailable}
            sceneVisible={sceneVisible}
            labelCopy={labelCopy}
            plans={plans}
            soundLabels={soundLabels}
          />
        )}

        <header className="packages-vend-copy">
          <p className="packages-vend-brand">{brand}</p>
          <h2>{title}</h2>
          <p>{instruction}</p>
        </header>

        <Panel
          backLabel={backLabel}
          ctaLabel={ctaLabel}
          ctaTitle={ctaTitle}
          heading={headingRef}
          onClose={closePanel}
          packageContentsLabel={packageContentsLabel}
          durationLabel={durationLabel}
          durationGroupLabel={durationGroupLabel}
          durationOptions={durationOptions}
          priceSummary={priceSummary}
          customPriceLabel={customPriceLabel}
          priceDisclaimer={priceDisclaimer}
          quoteAction={quoteAction}
          quoteTitle={quoteTitle}
          quoteInstructions={quoteInstructions}
          quoteUnavailable={quoteUnavailable}
          quoteEmailSubject={quoteEmailSubject}
          quoteEmailBody={quoteEmailBody}
          salesContactEmail={salesContactEmail}
          selectedDuration={selectedDuration}
          onDurationChange={setSelectedDuration}
          packageStatus={packageStatus}
          plan={plans[selectedIndex]}
          quiet={!panelOpen}
        />

        {sceneUnavailable && (
          <p className="packages-vend-fallback" role="status">
            {fallbackMessage}
          </p>
        )}

        {!sceneUnavailable && (
          <div className="packages-vend-accessible-controls" role="group" aria-label={selectLabel}>
            {profiles.map((profile, index) => (
              <button
                aria-label={profile.title}
                className="packages-vend-control-twin"
                key={profile.id}
                ref={(button) => void (packageControlRefs.current[index] = button)}
                onClick={() => selectPackage(index)}
                type="button"
              >
                {profile.title}
              </button>
            ))}
            <button
              className="packages-vend-control-twin"
              onClick={insertCoin}
              type="button"
            >
              {labelCopy.insertCoin}
            </button>
          </div>
        )}
        {sceneUnavailable && (
          <div className="packages-vend-fallback-controls" role="group" aria-label={selectLabel}>
            {profiles.map((profile, index) => (
              <button
                key={profile.id}
                onClick={() => selectPackage(index)}
                type="button"
              >
                {profile.title}
              </button>
            ))}
          </div>
        )}
        <p className="packages-vend-mark" aria-hidden="true">
          <span>İşBul KKTC</span>
          <span>{platformLabel}</span>
        </p>
      </div>
    </div>
  );
}
