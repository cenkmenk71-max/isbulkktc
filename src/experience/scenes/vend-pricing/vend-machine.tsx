"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Scene } from "./components/Scene";
import { takeOver } from "./lib/live";
import type { SceneLabels } from "./lib/labels";
import {
  setAmbience,
  sound,
  unlockAudio,
  type SoundMode,
} from "./lib/sfx";
import type { Plan } from "./lib/plans";
import type { Frame } from "./lib/timeline";

export type VendControls = {
  press: (index: number) => void;
  insertCoin: () => void;
  close: () => void;
};

type Props = {
  plans: Plan[];
  labelCopy: SceneLabels;
  soundLabels: { button: string; effects: string; rain: string; off: string };
  sceneVisible: boolean;
  onFrame: (frame: Frame, touring: boolean) => void;
  onSelect: (index: number) => void;
  onCoin: () => void;
  onWipe: () => void;
  onReady: (controls: VendControls | null) => void;
  onUnavailable: () => void;
};

function supportsWebGL() {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    return false;
  }
}

export default function VendMachine({
  plans,
  labelCopy,
  soundLabels,
  sceneVisible,
  onFrame,
  onSelect,
  onCoin,
  onWipe,
  onReady,
  onUnavailable,
}: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [mode, setMode] = useState<SoundMode>("fx");
  const controlsRef = useRef<VendControls | null>(null);
  const connectControls = useCallback(
    (controls: VendControls | null) => {
      controlsRef.current = controls;
      onReady(controls);
    },
    [onReady],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const isAvailable = supportsWebGL();
      setAvailable(isAvailable);
      if (!isAvailable) onUnavailable();
    });
    return () => cancelAnimationFrame(frame);
  }, [onUnavailable]);

  useEffect(() => {
    if (!available) return;

    const stopTour = (event: Event) => {
      if (!event.isTrusted) return;
      if (event.type !== "wheel") unlockAudio();
      takeOver();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      stopTour(event);
      if (event.key === "Escape") controlsRef.current?.close();
    };
    const unlock = (event: Event) => {
      if (event.isTrusted) unlockAudio();
    };

    window.addEventListener("click", unlock);
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("pointerdown", stopTour);
    window.addEventListener("wheel", stopTour);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("pointerdown", stopTour);
      window.removeEventListener("wheel", stopTour);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [available]);

  useEffect(
    () => {
      sound.mode = "fx";
      return () => {
        sound.mode = "off";
        setAmbience(false);
      };
    },
    [],
  );

  if (!available) return null;
  const cycleSound = () => {
    const next: Record<SoundMode, SoundMode> = {
      fx: "all",
      all: "off",
      off: "fx",
    };
    const nextMode = next[mode];
    sound.mode = nextMode;
    unlockAudio();
    setAmbience(nextMode === "all");
    setMode(nextMode);
  };
  const modeLabel = { fx: soundLabels.effects, all: soundLabels.rain, off: soundLabels.off }[mode];

  return (
    <>
      <Scene
        labelCopy={labelCopy}
        onFrame={onFrame}
        onReady={connectControls}
        onCoin={onCoin}
        onSelect={onSelect}
        onWipe={onWipe}
        plans={plans}
        sceneVisible={sceneVisible}
      />
      <button
        aria-label={`${soundLabels.button}: ${modeLabel}`}
        className="packages-vend-sound"
        onClick={cycleSound}
        type="button"
      >
        {mode === "fx" ? "FX" : mode === "all" ? "RAIN" : "OFF"}
      </button>
    </>
  );
}
