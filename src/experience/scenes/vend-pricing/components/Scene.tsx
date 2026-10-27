import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FOG_CLEAR, Machine, TRAY } from "./Machine";
import { Backdrop, Ground } from "./Street";
import {
  disposeLabels,
  loadLabels,
  labelsReady,
  type Labels,
  type SceneLabels,
} from "../lib/labels";
import {
  CAPTURE,
  REDUCED_MOTION,
  actions,
  clock,
  frameNow,
  live,
  wipesNow,
} from "../lib/live";
import { sfx } from "../lib/sfx";
import type { Plan } from "../lib/plans";
import { LOOP, lerp } from "../lib/time";
import type { Frame } from "../lib/timeline";

const SCENE_BACKGROUND = "#07110d";

declare global {
  interface Window {
    __bf?: { loop: number; setTime: (t: number) => Promise<void> };
  }
}

// Pointer in -1..1, read from window so the DOM overlay never has to pass events through
const pointer = { x: 0, y: 0 };

function PointerTracker() {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (CAPTURE) return;
    const onMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
      invalidate();
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [invalidate]);

  return null;
}

// Frame the whole machine at rest and the lower half during delivery, leaving room for the package panel.
function useShots() {
  const { size } = useThree();
  const aspect = size.width / size.height;
  const wide = aspect >= 1.35;
  const balanced = aspect >= 0.85;
  return useMemo(
    () =>
      wide
        ? {
            rest: { pos: new THREE.Vector3(-1.35, 1.75, 7.4), look: new THREE.Vector3(-1.35, 1.5, 0) },
            tray: { pos: new THREE.Vector3(TRAY.x - 1.25, 1.2, 4.9), look: new THREE.Vector3(TRAY.x - 1.25, 0.95, 0) },
          }
        : balanced
          ? {
              rest: { pos: new THREE.Vector3(-0.75, 1.75, 8.8), look: new THREE.Vector3(-0.75, 1.5, 0) },
              tray: { pos: new THREE.Vector3(TRAY.x - 0.7, 1, 5.7), look: new THREE.Vector3(TRAY.x - 0.7, 0.75, 0) },
            }
        : {
            rest: { pos: new THREE.Vector3(0, 1.5, 10.5), look: new THREE.Vector3(0, 2.1, 0) },
            // The bottom sheet covers the lower ~70%, so aim below the tray to lift it into the top of the screen
            tray: { pos: new THREE.Vector3(TRAY.x, 0.35, 7.4), look: new THREE.Vector3(TRAY.x, -0.95, 0) },
          },
    [balanced, wide],
  );
}

// Sounds for moments inside a vend, found by comparing this frame with the last (the tour stays silent)
let lastTick = -1;
function sounds(prev: Frame, f: Frame, now: number) {
  if (prev.can.fall < 1 && f.can.fall >= 1) sfx.thunk();
  if (f.stopped > prev.stopped) sfx.stop();
  else if (f.slot !== prev.slot && f.slot !== "----" && f.stopped < 4 && now - lastTick > 0.045) {
    lastTick = now;
    sfx.tick();
  }
}

// Runs first every frame: advances the clock, computes the one Frame everything reads, moves the camera
function Director({
  onFrame,
  onReady,
  active,
}: {
  onFrame: (f: Frame) => void;
  onReady: (controls: { press: (index: number) => void; insertCoin: () => void; close: () => void } | null) => void;
  active: boolean;
}) {
  const { camera, invalidate } = useThree();
  const shots = useShots();
  const look = useMemo(() => new THREE.Vector3(), []);
  const reducedMotionFrame = useRef<number | null>(null);

  useEffect(() => {
    if (active) invalidate();
  }, [active, invalidate]);

  const animateReducedMotion = useMemo(
    () => () => {
      if (
        !REDUCED_MOTION ||
        live.motionUntil === null ||
        reducedMotionFrame.current !== null
      ) {
        return;
      }
      let previous = performance.now();
      const tick = (now: number) => {
        if (live.motionUntil === null) {
          reducedMotionFrame.current = null;
          return;
        }
        clock.time += (now - previous) / 1000;
        previous = now;
        if (clock.time >= live.motionUntil) live.motionUntil = null;
        invalidate();
        if (live.motionUntil !== null) {
          reducedMotionFrame.current = requestAnimationFrame(tick);
        } else {
          reducedMotionFrame.current = null;
        }
      };
      reducedMotionFrame.current = requestAnimationFrame(tick);
    },
    [invalidate],
  );

  useEffect(() => {
    onReady({
      press(index) {
        actions.press(index);
        invalidate();
        animateReducedMotion();
      },
      insertCoin() {
        actions.coin();
        invalidate();
        animateReducedMotion();
      },
      close() {
        actions.close();
        invalidate();
        animateReducedMotion();
      },
    });
    return () => onReady(null);
  }, [animateReducedMotion, invalidate, onReady]);

  useEffect(
    () => () => {
      if (reducedMotionFrame.current !== null) {
        cancelAnimationFrame(reducedMotionFrame.current);
      }
      reducedMotionFrame.current = null;
      live.motionUntil = null;
    },
    [],
  );

  useEffect(() => {
    if (!CAPTURE) return;
    // Wait for the labels, so the recorder never grabs a frame with blank cans
    let alive = true;
    labelsReady.then(() => {
      if (!alive) return;
      window.__bf = {
        loop: LOOP,
        setTime: (t) =>
          new Promise((resolve) => {
            clock.time = t;
            invalidate();
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      };
    });
    return () => void (alive = false);
  }, [invalidate]);

  useFrame((_, delta) => {
    if (!CAPTURE && !REDUCED_MOTION) clock.time += delta;
    const f = frameNow(clock.time);
    if (!live.touring) sounds(live.frame, f, clock.time);
    live.frame = f;
    onFrame(f);
    const k = f.dolly * f.dolly * (3 - 2 * f.dolly);
    const { rest, tray } = shots;
    const sway = CAPTURE ? 0 : 1;
    camera.position.set(
      lerp(rest.pos.x, tray.pos.x, k) + pointer.x * 0.25 * sway,
      lerp(rest.pos.y, tray.pos.y, k) + pointer.y * 0.12 * sway + f.shake * 0.02,
      lerp(rest.pos.z, tray.pos.z, k),
    );
    look.lerpVectors(rest.look, tray.look, k);
    camera.lookAt(look);
  }, -1);
  return null;
}

// Procedural reflections for the chrome, cans and glass, balanced for the warm daylight palette.
function Reflections() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    // Three.js scenes are mutable; assigning the environment is renderer setup.
    // eslint-disable-next-line react-hooks/immutability
    scene.environment = env;
    scene.environmentIntensity = 0.58;
    return () => {
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

// Redraw the package-code display on change and refresh the condensation texture at most 24 times per second.
function Displays({ labels }: { labels: Labels }) {
  const shownSlot = useRef("");
  const lastFogTime = useRef(Number.NEGATIVE_INFINITY);
  const lastWipe = useRef<ReturnType<typeof wipesNow>[number] | null>(null);
  useFrame(() => {
    const f = live.frame;
    const slot = `${f.slot}${f.blink}`;
    if (slot !== shownSlot.current) {
      shownSlot.current = slot;
      labels.setSlot(f.slot, f.blink);
    }
    const latestWipe = live.wipes.at(-1) ?? null;
    if (clock.time - lastFogTime.current >= 1 / 24 || latestWipe !== lastWipe.current) {
      labels.drawFog(clock.time, wipesNow(clock.time), FOG_CLEAR);
      lastFogTime.current = clock.time;
      lastWipe.current = latestWipe;
    }
  });
  return null;
}

export function Scene({
  onFrame,
  onReady,
  onSelect,
  onCoin,
  onWipe,
  plans,
  labelCopy,
  sceneVisible,
}: {
  onFrame: (f: Frame, touring: boolean) => void;
  onReady: (controls: { press: (index: number) => void; insertCoin: () => void; close: () => void } | null) => void;
  onSelect: (index: number) => void;
  onCoin: () => void;
  onWipe: () => void;
  plans: Plan[];
  labelCopy: SceneLabels;
  sceneVisible: boolean;
}) {
  const [maxTextureSize, setMaxTextureSize] = useState<number | null>(null);
  const [labels, setLabels] = useState<Labels | null>(null);
  const [documentVisible, setDocumentVisible] = useState(!document.hidden);
  const [closeUp, setCloseUp] = useState(false);
  const closeUpRef = useRef(false);
  useEffect(() => {
    if (maxTextureSize === null) return;
    let alive = true;
    let loaded: Labels | null = null;
    void loadLabels(plans, labelCopy, maxTextureSize).then((l) => {
      loaded = l;
      if (alive) setLabels(l);
      else disposeLabels(l);
    });
    return () => {
      alive = false;
      if (loaded) disposeLabels(loaded);
    };
  }, [labelCopy, maxTextureSize, plans]);

  useEffect(() => {
    const updateVisibility = () => setDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  const light = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
  const maxDpr = light ? 1.5 : 2;
  const baseDpr = Math.min(window.devicePixelRatio, maxDpr);
  const active = sceneVisible && documentVisible;
  const handleFrame = (frame: Frame) => {
    const isCloseUp = frame.dolly > 0.25;
    if (isCloseUp !== closeUpRef.current) {
      closeUpRef.current = isCloseUp;
      setCloseUp(isCloseUp);
    }
    onFrame(frame, live.touring);
  };

  return (
    <Canvas
      className="packages-vend-canvas"
      dpr={closeUp ? maxDpr : baseDpr}
      frameloop={
        active
          ? CAPTURE || REDUCED_MOTION
            ? "demand"
            : "always"
          : "never"
      }
      gl={{ antialias: true, preserveDrawingBuffer: CAPTURE }}
      // Neutral tone mapping keeps the neon and the white cabinet true (ACES shifts them)
      onCreated={({ gl }) => {
        setMaxTextureSize(gl.capabilities.maxTextureSize);
        gl.toneMapping = THREE.NeutralToneMapping;
      }}
      camera={{ position: [0, 1.8, 7.4], fov: 32 }}
    >
      <color attach="background" args={[SCENE_BACKGROUND]} />
      <fog attach="fog" args={[SCENE_BACKGROUND, 11, 28]} />
      <ambientLight intensity={0.48} color="#d9eadf" />
      <directionalLight position={[3, 6, 5]} intensity={1.05} color="#fff3d6" />
      <Reflections />
      <PointerTracker />
      <Director active={active} onFrame={handleFrame} onReady={onReady} />
      {labels && (
        <>
          <Displays labels={labels} />
          <Machine labels={labels} plans={plans} onCoin={onCoin} onSelect={onSelect} onWipe={onWipe} />
          <Backdrop labels={labels} />
          <Ground labels={labels} />
        </>
      )}
    </Canvas>
  );
}
