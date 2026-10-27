import { loopTime } from "./time";
import { sfx } from "./sfx";
import {
  CLOSE_DUR, COIN_DUR, REST, SPIN_END, SPIN_START, TOUR_WIPES, VEND_DONE, addWipe, close, frameAt, insertCoin, press, rebase, tourAt, tourState,
  type Wipe,
} from "./timeline";

// Browser-side state. The pure core (time, plans, timeline) never reads window; this file does.

// ?capture freezes the clock: a recorder calls window.__bf.setTime(t) and grabs one frame per step
export const CAPTURE = new URLSearchParams(window.location.search).has("capture");
export const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const clock = { time: 0 };
export const live = {
  touring: false,
  machine: REST,
  frame: frameAt(REST, 0), // written once per rendered frame by <Scene>, read by everything else
  wipes: [] as Wipe[], // where visitors have cleared the fog, in clock time
  motionUntil: null as number | null,
};

export const frameNow = (t: number) => (live.touring ? tourAt(t) : frameAt(live.machine, t));

// The first real input adopts whatever the tour is doing, so nothing jumps
export function takeOver() {
  if (!live.touring || CAPTURE) return;
  const s = loopTime(clock.time);
  live.machine = rebase(tourState(s), s, clock.time);
  live.wipes.push(...TOUR_WIPES.map((w) => ({ ...w, at: w.at + clock.time - s })));
  live.touring = false;
}

export const actions = {
  coin() {
    takeOver();
    live.machine = insertCoin(live.machine, clock.time);
    live.motionUntil = REDUCED_MOTION && !CAPTURE ? clock.time + COIN_DUR : null;
    sfx.coin();
  },
  press(tier: number) {
    takeOver();
    const next = press(live.machine, tier, clock.time);
    if (next === live.machine) return;
    live.motionUntil = REDUCED_MOTION && !CAPTURE ? clock.time + VEND_DONE : null;
    sfx.click();
    sfx.roll(SPIN_END - SPIN_START);
    live.machine = next;
  },
  close() {
    takeOver();
    const next = close(live.machine, clock.time);
    if (next !== live.machine) {
      if (REDUCED_MOTION && !CAPTURE) live.motionUntil = clock.time + CLOSE_DUR;
      sfx.click();
    }
    live.machine = next;
  },
};

// Every wipe on screen now: the tour's stroke (while it runs) and the visitors' own
export function wipesNow(t: number): Wipe[] {
  const base = t - loopTime(t);
  const tour = live.touring ? TOUR_WIPES.map((w) => ({ ...w, at: base + w.at })) : [];
  return [...tour, ...live.wipes];
}

let lastSqueak = -1;

// A pointer moved over the glass
export function wipe(u: number, v: number) {
  if (CAPTURE) return;
  const gap = addWipe(live.wipes, u, v, clock.time);
  if (gap > 0.02 && performance.now() - lastSqueak > 70) {
    lastSqueak = performance.now();
    sfx.wipe(gap);
  }
}
