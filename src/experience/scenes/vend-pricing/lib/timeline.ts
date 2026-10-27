import { LOOP, TAU, clamp01, loopTime, rng, smooth } from "./time";
import { TOUR_TIER } from "./plans";

// Everything on screen is a Frame, computed from a Machine state and the time now.
// The demo tour is the same thing: tourState(s) is the state a visitor would have made by s seconds into the loop.

export type Machine = {
  tier: number;
  pressAt: number | null;
  closeAt: number | null;
  coinAt: number | null;
};

export type Phase = "idle" | "vending" | "delivered" | "closing";

export type Frame = {
  coin: number; // 0..1 travelling into the duration selector, -1 hidden
  tier: number; // shelf being vended, -1 none
  press: number; // 0..1 depth of that shelf's button
  spin: number; // 0..1 of the rack rolling one can forward; 1 at rest
  can: { visible: boolean; z: number; fall: number; bounce: number; out: number };
  dolly: number; // 0 street view … 1 at the tray
  panel: number; // 0 hidden … 1 open
  shake: number; // -1..1 camera jolt when the can lands
  flicker: number; // 1 lit, lower when the sign stutters
  slot: string; // the 4-digit roulette over the tray, "----" when idle
  stopped: number; // how many roulette digits have stopped, 0..4
  blink: boolean;
};

// Vend, relative to the press (seconds)
export const PRESS_DUR = 0.25;
export const SPIN_START = 0.1;
export const SPIN_END = 1.3;
export const FALL_DUR = 0.55; // SPIN_END → landing
export const LAND = SPIN_END + FALL_DUR;
export const DOLLY_START = 2.0;
export const DOLLY_END = 2.8;
export const PANEL_START = 2.3;
export const VEND_END = 2.9; // phase becomes "delivered"
// The package code display starts as the can lands and resolves left to right.
export const SLOT_START = 1.9;
export const SLOT_STEP = 0.35;
export const SLOT_END = SLOT_START + 4 * SLOT_STEP;
export const VEND_DONE = Math.max(VEND_END, SLOT_END);
// Close, relative to "Back to machine"
export const CLOSE_DUR = 0.9;
export const COIN_DUR = 0.4;

// The tour inside one LOOP (seconds)
export const TOUR_PRESS = 2.5;
export const TOUR_CLOSE = 8.2;

export const REST: Machine = { tier: -1, pressAt: null, closeAt: null, coinAt: null };

export function phase(m: Machine, now: number): Phase {
  if (m.pressAt === null) return "idle";
  if (m.closeAt !== null) return now - m.closeAt < CLOSE_DUR ? "closing" : "idle";
  return now - m.pressAt < VEND_END ? "vending" : "delivered";
}

export function press(m: Machine, tier: number, now: number): Machine {
  return phase(m, now) === "idle" ? { ...m, tier, pressAt: now, closeAt: null } : m;
}

export function close(m: Machine, now: number): Machine {
  return phase(m, now) === "delivered" ? { ...m, closeAt: now } : m;
}

export function insertCoin(m: Machine, now: number): Machine {
  return { ...m, coinAt: now };
}

// The state the tour is in at loop time s. frameAt(t) draws it, and the first real input adopts it (with now = s).
export function tourState(s: number): Machine {
  const m: Machine = { ...REST };
  if (s >= TOUR_PRESS && s < TOUR_CLOSE + CLOSE_DUR)
    Object.assign(m, { tier: TOUR_TIER, pressAt: TOUR_PRESS, closeAt: s >= TOUR_CLOSE ? TOUR_CLOSE : null });
  return m;
}

// Shift a state's timestamps so it reads the same at `now` as it did at `then` (hand-over from the tour)
export function rebase(m: Machine, then: number, now: number): Machine {
  const d = now - then;
  return {
    ...m,
    pressAt: m.pressAt === null ? null : m.pressAt + d,
    closeAt: m.closeAt === null ? null : m.closeAt + d,
    coinAt: m.coinAt === null ? null : m.coinAt + d,
  };
}

// The sign stutters in these loop-time windows
const FLICKERS: [number, number][] = [
  [0.62, 0.7],
  [0.78, 0.83],
  [7.1, 7.16],
];

export function frameAt(m: Machine, now: number): Frame {
  const s = loopTime(now);
  const f: Frame = {
    coin:
      m.coinAt !== null && now - m.coinAt >= 0 && now - m.coinAt < COIN_DUR
        ? clamp01((now - m.coinAt) / COIN_DUR)
        : -1,
    tier: -1,
    press: 0,
    spin: 1,
    can: { visible: false, z: 0, fall: 0, bounce: 0, out: 0 },
    dolly: 0,
    panel: 0,
    shake: 0,
    flicker: FLICKERS.some(([a, b]) => s >= a && s < b) ? 0.25 : 1,
    slot: "----",
    stopped: 0,
    blink: false,
  };
  if (m.pressAt === null || phase(m, now) === "idle") return f;

  const dt = now - m.pressAt;
  const cdt = m.closeAt === null ? null : now - m.closeAt;
  const shut = (dur: number) => (cdt === null ? 1 : 1 - smooth(0, dur, cdt));
  f.tier = m.tier;
  f.press = dt < PRESS_DUR ? Math.sin((Math.PI * dt) / PRESS_DUR) : 0;
  f.spin = smooth(SPIN_START, SPIN_END, dt);
  const out = cdt === null ? 0 : smooth(0.1, 0.6, cdt);
  f.can = {
    visible: out < 1,
    z: f.spin,
    fall: clamp01((dt - SPIN_END) / FALL_DUR),
    bounce: dt >= LAND && dt < LAND + 0.25 ? Math.sin((Math.PI * (dt - LAND)) / 0.25) : 0,
    out,
  };
  f.dolly = smooth(DOLLY_START, DOLLY_END, dt) * shut(CLOSE_DUR);
  f.panel = smooth(PANEL_START, VEND_END, dt) * shut(0.4);
  const k = dt - LAND;
  f.shake = k >= 0 && k < 0.4 ? Math.sin(k * 70) * (1 - k / 0.4) : 0;
  f.slot = slotAt(dt, m.tier);
  f.stopped = dt < SLOT_START ? 0 : Math.min(4, Math.floor((dt - SLOT_START) / SLOT_STEP));
  f.blink = dt >= SLOT_END && dt < SLOT_END + 0.5 && Math.floor((dt - SLOT_END) * 6) % 2 === 0;
  return f;
}

export function slotAt(dt: number, tier: number) {
  if (dt < SLOT_START) return "----";
  const end = String(tier + 1).padStart(4, "0");
  let out = "";
  for (let i = 0; i < 4; i++)
    out += dt >= SLOT_START + (i + 1) * SLOT_STEP ? end[i] : String(Math.floor(dt * 23 + i * 3.7) % 10);
  return out;
}

// The tour at any time t: pure in t, so any frame can be recorded and frame 0 = frame LOOP
export const tourAt = (t: number) => {
  const s = loopTime(t);
  return frameAt(tourState(s), s);
};

// Rain: each drop falls a whole number of times per LOOP, so the rain loops too
export const RAIN_COUNT = 420;
export type Drop = { x: number; z: number; k: number; phase: number };
export const DROPS: Drop[] = (() => {
  const r = rng(21);
  return Array.from({ length: RAIN_COUNT }, () => ({
    x: (r() - 0.5) * 14,
    z: -4 + r() * 9,
    k: 9 + Math.floor(r() * 6), // falls per LOOP
    phase: r(),
  }));
})();

// 1 at the top of the fall, 0 at the ground
export const dropY = (d: Drop, t: number) => {
  const u = (loopTime(t) * d.k) / LOOP + d.phase;
  return 1 - (u - Math.floor(u));
};

// Fog on the glass. A wipe is a point where a finger or cursor cleared it; the fog grows back over a few seconds.
export type Wipe = { u: number; v: number; at: number }; // u, v across the glass 0..1; at: seconds
export const wipeStrength = (age: number) => (age < 0 ? 0 : 1 - smooth(1.5, 5, age));

// The tour wipes one S-shaped stroke across the glass early in the loop; it has grown back long before the loop ends
export const TOUR_WIPES: Wipe[] = Array.from({ length: 28 }, (_, i) => {
  const k = i / 27;
  return { u: 0.1 + 0.8 * k, v: 0.8 - 0.5 * k + 0.08 * Math.sin(k * TAU), at: 0.3 + 0.8 * k };
});

// Add a pointer position over the glass at time t: drop wipes that have grown back, fill in a fast swipe with points
// no more than 0.02 apart, and keep at most MAX_WIPES (with a frozen clock nothing ever grows back). Returns the gap.
export const MAX_WIPES = 300;
export function addWipe(list: Wipe[], u: number, v: number, t: number) {
  while (list.length && wipeStrength(t - list[0].at) === 0) list.shift();
  const last = list[list.length - 1];
  const gap = last && t - last.at < 0.2 ? Math.hypot(u - last.u, v - last.v) : 0;
  const steps = Math.min(20, Math.ceil(gap / 0.02));
  for (let i = 1; i < steps; i++) list.push({ u: last.u + ((u - last.u) * i) / steps, v: last.v + ((v - last.v) * i) / steps, at: t });
  list.push({ u, v, at: t });
  if (list.length > MAX_WIPES) list.splice(0, list.length - MAX_WIPES);
  return gap;
}
