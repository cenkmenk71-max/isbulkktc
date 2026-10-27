// Pure time helpers. No window or document here: tools/scripts/checks/vend.check.ts imports this in Node.

// The demo tour repeats every LOOP seconds; anything periodic uses a whole number of cycles per LOOP.
export const LOOP = 12;
export const TAU = Math.PI * 2;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// Seconds into the current loop
export const loopTime = (t: number) => ((t % LOOP) + LOOP) % LOOP;

// Smoothstep from a to b
export const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

// Seeded 0..1 random stream (mulberry32), so rain and flicker look random but are the same every run
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
