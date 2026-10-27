// Every sound is synthesized with Web Audio: no audio files.
// Browsers only allow audio after a real click or key, so nothing plays during the tour.
// Modes: "fx" (default) plays short effects for what the visitor does; "all" adds rain and the neon hum; "off" is silent.

export type SoundMode = "fx" | "all" | "off";
export const sound = { mode: "fx" as SoundMode };

let ctx: AudioContext | null = null;
let out: GainNode;
let noise: AudioBuffer;
let bed: { stop: () => void } | null = null;

// Called from a click or key handler, the only place a browser lets audio start
export function unlockAudio() {
  if (sound.mode === "off") return;
  if (!ctx) {
    ctx = new AudioContext();
    const squash = ctx.createDynamicsCompressor();
    out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(squash).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
}

const ready = () => (ctx && sound.mode !== "off" ? ctx : null);

// A gain envelope: quick attack to `peak`, exponential decay over `dur`
function env(c: AudioContext, at: number, peak: number, dur: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(out);
  return g;
}

function tone(freq: number, dur: number, peak: number, type: OscillatorType = "sine", delay = 0, glideTo?: number) {
  const c = ready();
  if (!c) return;
  const at = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
  o.connect(env(c, at, peak, dur));
  o.start(at);
  o.stop(at + dur + 0.02);
}

function hiss(dur: number, peak: number, filter: BiquadFilterType, freq: number, delay = 0) {
  const c = ready();
  if (!c) return;
  const at = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  src.connect(f).connect(env(c, at, peak, dur));
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
}

export const sfx = {
  // A plastic button
  click: () => hiss(0.04, 0.5, "bandpass", 2200),
  coin() {
    tone(2350, 0.35, 0.25);
    tone(3720, 0.25, 0.12);
    for (let i = 0; i < 4; i++) {
      hiss(0.03, 0.2 - i * 0.04, "bandpass", 3000, 0.12 + i * 0.07);
    }
  },
  // The rack rolling one can forward
  roll: (dur: number) => hiss(dur, 0.18, "lowpass", 700),
  // The can landing in the tray: a low thud, a hollow knock and a thin metal ring
  thunk() {
    tone(110, 0.22, 0.9, "sine", 0, 45);
    hiss(0.12, 0.5, "lowpass", 1200);
    tone(1380, 0.3, 0.06, "triangle");
  },
  // Roulette: a tick per digit change while spinning, a clack per digit that stops
  tick: () => hiss(0.012, 0.12, "highpass", 3500),
  stop: () => hiss(0.05, 0.4, "bandpass", 1200),
  // Wiping the glass: a short squeak-hiss, louder for a faster swipe
  wipe(speed: number) {
    const level = Math.min(0.16, 0.025 + speed * 1.8);
    hiss(0.09, level, "bandpass", 1800 + speed * 4000);
    tone(680 + speed * 900, 0.08, level * 0.55, "sawtooth", 0, 260);
  },
};

// Rain on the street and the hum of the fluorescent tube, only in "all"
export function setAmbience(on: boolean) {
  bed?.stop();
  bed = null;
  const c = ready();
  if (!on || !c) return;
  const rain = c.createBufferSource();
  rain.buffer = noise;
  rain.loop = true;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1400;
  band.Q.value = 0.4;
  const rainGain = c.createGain();
  rainGain.gain.value = 0.18;
  rain.connect(band).connect(rainGain).connect(out);
  const hum = c.createOscillator();
  hum.frequency.value = 100;
  const humGain = c.createGain();
  humGain.gain.value = 0.015;
  hum.connect(humGain).connect(out);
  rain.start();
  hum.start();
  bed = {
    stop() {
      rain.stop();
      hum.stop();
    },
  };
}
