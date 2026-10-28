import * as THREE from "three";
import { PRODUCT, type Plan } from "./plans";
import { rng } from "./time";
import { wipeStrength, type Wipe } from "./timeline";
import type { AppLocale } from "@/i18n/routing";

// Every word on the machine is drawn into a canvas texture: no image files.

export const INK = "#07080c";
export const AMBER = "#c6a46a";
export const CYAN = "#9cbba7";
export const MAGENTA = "#4b8066";
const fontFamily = (property: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(property).trim() ||
  fallback;
const DISPLAY = fontFamily("--font-geist-sans", "ui-sans-serif, sans-serif");
const DOT = fontFamily(
  "--font-geist-mono",
  "ui-monospace, SFMono-Regular, monospace",
);

export type SceneLabels = {
  locale: AppLocale;
  package: string;
  selectPackage: string;
  viewScope: string;
  insertCoin: string;
  careerHub: string;
  region: string;
  listing: string;
  quote: string;
};

// Canvas text waits for web fonts if available, with a fast safe fallback
export const labelsReady = (async () => {
  if (typeof document === "undefined" || !document.fonts?.load) {
    return undefined;
  }
  try {
    const primaryDisplay = DISPLAY.split(",")[0].trim().replace(/['"]/g, "");
    const primaryDot = DOT.split(",")[0].trim().replace(/['"]/g, "");

    await Promise.race([
      Promise.allSettled([
        document.fonts.load(`700 64px "${primaryDisplay}"`).catch(() => []),
        document.fonts.load(`400 64px "${primaryDot}"`).catch(() => []),
        document.fonts.ready.catch(() => undefined),
      ]),
      new Promise((resolve) => setTimeout(resolve, 400)),
    ]);
  } catch (err) {
    console.warn("Font loading fallback engaged:", err);
  }
  return undefined;
})();

type LogicalCanvas = { width: number; height: number; scale: number };
const logicalCanvases = new WeakMap<CanvasRenderingContext2D, LogicalCanvas>();

function dimensions(g: CanvasRenderingContext2D) {
  const logical = logicalCanvases.get(g);
  return logical
    ? { width: logical.width, height: logical.height }
    : { width: g.canvas.width, height: g.canvas.height };
}

function texture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
  scale = 1,
): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const context = c.getContext("2d");
  if (!context) {
    // Large label canvases can be refused in memory-constrained browsers. Fail
    // with a descriptive error so the caller can retry at a smaller scale or
    // fall back to DataTextures instead of surfacing a WeakMap TypeError.
    throw new Error(
      `[packages-vend] 2D canvas context unavailable for a ${c.width}x${c.height} label texture`,
    );
  }
  logicalCanvases.set(context, { width: w, height: h, scale });
  context.scale(scale, scale);
  draw(context);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

// Redraw an existing texture in place when its animated display changes.
function redraw(t: THREE.Texture, draw: (g: CanvasRenderingContext2D) => void) {
  const image = t.image as HTMLCanvasElement | undefined;
  // The low-memory label fallback uses DataTextures, which intentionally have no
  // canvas to redraw. Keep their neutral surfaces stable instead of throwing.
  if (!image || typeof image.getContext !== "function") return;
  const context = image.getContext("2d");
  if (!context) return;
  const logical = logicalCanvases.get(context);
  context.setTransform(logical?.scale ?? 1, 0, 0, logical?.scale ?? 1, 0, 0);
  draw(context);
  t.needsUpdate = true;
}

// A can's wrap-around label: a colour gradient with a light band, the plan name big on the front and back,
// the product in small caps, and a thin ingredient-style line of text
function drawCan(g: CanvasRenderingContext2D, p: Plan, labels: SceneLabels) {
  const { width: w, height: h } = dimensions(g);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, p.color);
  grd.addColorStop(1, shade(p.color, 0.55));
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  const sheen = g.createLinearGradient(0, 0, w, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.24, "rgba(255,255,255,0.2)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.04)");
  sheen.addColorStop(0.76, "rgba(255,255,255,0.16)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = sheen;
  g.fillRect(0, h * 0.08, w, h * 0.54);
  g.fillStyle = "rgba(255,255,255,0.82)";
  g.fillRect(0, h * 0.12, w, h * 0.018);
  g.fillStyle = "rgba(7,8,12,0.12)";
  g.fillRect(0, h * 0.68, w, h * 0.035);
  g.fillStyle = INK;
  g.fillRect(0, h * 0.8, w, h * 0.2);
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const x of [w * 0.25, w * 0.75]) {
    g.fillStyle = "#fff";
    g.font = `400 ${h * 0.075}px ${DOT}`;
    g.fillText(PRODUCT, x, h * 0.26, w * 0.4);
    g.font = `700 ${h * 0.34}px ${DISPLAY}`;
    g.lineJoin = "round";
    g.lineWidth = h * 0.025;
    g.strokeStyle = "rgba(4,12,10,0.88)";
    g.strokeText(p.name.toLocaleUpperCase(labels.locale), x, h * 0.52, w * 0.42);
    g.fillStyle = "#fffdf8";
    g.fillText(p.name.toLocaleUpperCase(labels.locale), x, h * 0.52, w * 0.42);
    g.fillStyle = "#dce8df";
    g.font = `600 ${h * 0.08}px ${DOT}`;
    g.fillText(labels.package.toLocaleUpperCase(labels.locale), x, h * 0.9, w * 0.4);
  }
}

// Darken a #rrggbb colour by k (0..1 of the original)
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * k);
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// The amber LED strip under a shelf: name on the left, price on the right
function drawStrip(g: CanvasRenderingContext2D, p: Plan, labels: SceneLabels) {
  const { width: w, height: h } = dimensions(g);
  const base = g.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, "#101a17");
  base.addColorStop(0.54, "#11130f");
  base.addColorStop(1, "#211b10");
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const edge = g.createLinearGradient(0, 0, w, 0);
  edge.addColorStop(0, p.color);
  edge.addColorStop(0.56, AMBER);
  edge.addColorStop(1, p.color);
  g.fillStyle = edge;
  g.fillRect(0, 0, w, Math.max(2, h * 0.035));
  g.fillStyle = edge;
  g.shadowBlur = 0;
  g.fillStyle = "#f4f4ee";
  g.font = `600 ${h * 0.6}px ${DOT}`;
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillText(p.name.toLocaleUpperCase(labels.locale), h * 0.4, h * 0.54);
  g.textAlign = "right";
  const quantity = p.listingCount === null
    ? labels.quote
    : `${p.listingCount} ${labels.listing}`;
  g.fillText(quantity.toLocaleUpperCase(labels.locale), w - h * 0.4, h * 0.54, w * 0.55);
  g.shadowBlur = 0;
}

const FOG_W = 512;
const FOG_H = 800;
const WIPE_R = 42;

function drawSlot(g: CanvasRenderingContext2D, text: string, blink: boolean, labels: SceneLabels) {
  const { width: w, height: h } = dimensions(g);
  g.fillStyle = "#0a0203";
  g.fillRect(0, 0, w, h);
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.font = `400 ${h * 0.2}px ${DOT}`;
  g.fillStyle = CYAN;
  g.shadowColor = CYAN;
  g.shadowBlur = 3;
  g.fillText(labels.package.toLocaleUpperCase(labels.locale), h * 0.2, h * 0.54);
  g.textAlign = "right";
  g.font = `400 ${h * 0.72}px ${DOT}`;
  g.fillStyle = blink ? "#3a1c24" : AMBER;
  g.shadowColor = AMBER;
  g.shadowBlur = blink ? 0 : 6;
  g.fillText(text.split("").join(" "), w - h * 0.2, h * 0.54, w * 0.66);
  g.shadowBlur = 0;
}

function drawSelection(g: CanvasRenderingContext2D, labels: SceneLabels) {
  const { width: w, height: h } = dimensions(g);
  g.fillStyle = "#020a0c";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#f2dfb7";
  g.shadowColor = CYAN;
  g.shadowBlur = 4;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `600 ${h * 0.34}px ${DOT}`;
  g.fillText(labels.selectPackage.toLocaleUpperCase(labels.locale), w / 2, h * 0.4, w * 0.9);
  g.font = `500 ${h * 0.19}px ${DOT}`;
  g.fillStyle = "#d7e8dc";
  g.fillText(labels.viewScope.toLocaleUpperCase(labels.locale), w / 2, h * 0.78, w * 0.9);
  g.shadowBlur = 0;
}

export function makeLabels(
  plans: Plan[],
  copy: SceneLabels,
  textScale = 1,
) {
  // Keep the default texture budget conservative. GPU maxTextureSize is only a
  // dimension limit, not a signal that the browser has spare canvas/GPU memory.
  // Callers may explicitly request a smaller scale for a recovery attempt.
  const cans = plans.map((p) =>
    texture(2048, 768, (g) => drawCan(g, p, copy), textScale),
  );
  const strips = plans.map((p) =>
    texture(2048, 192, (g) => drawStrip(g, p, copy), textScale),
  );
  const selection = texture(
    1024,
    320,
    (g) => drawSelection(g, copy),
    textScale,
  );
  const buttons = plans.map((p) =>
    texture(512, 192, (g) => {
      const plate = g.createLinearGradient(0, 0, 512, 192);
      plate.addColorStop(0, "#111b18");
      plate.addColorStop(0.52, "#171b1b");
      plate.addColorStop(1, "#10131a");
      g.fillStyle = plate;
      g.fillRect(0, 0, 512, 192);
      const accent = g.createLinearGradient(0, 0, 0, 192);
      accent.addColorStop(0, "#f2dfb7");
      accent.addColorStop(1, p.color);
      g.fillStyle = accent;
      g.fillRect(0, 0, 10, 192);
      g.beginPath();
      g.arc(54, 96, 20, 0, Math.PI * 2);
      g.fillStyle = p.color;
      g.shadowColor = p.color;
      g.shadowBlur = 12;
      g.fill();
      g.shadowBlur = 0;
      g.beginPath();
      g.arc(54, 96, 8, 0, Math.PI * 2);
      g.fillStyle = "#f4f0e6";
      g.fill();
      g.fillStyle = "#f0f2ed";
      g.font = `600 72px ${DISPLAY}`;
      g.textBaseline = "middle";
      g.fillText(p.name.toLocaleUpperCase(copy.locale), 96, 100, 388);
    }, textScale),
  );
  // The neon wordmark on top of the machine: tubes are a bright core over a blurred halo
  const sign = texture(2048, 320, (g) => {
    g.fillStyle = "#0b0d12";
    g.fillRect(0, 0, 2048, 320);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `700 208px ${DISPLAY}`;
    g.lineWidth = 12;
    const brandGradient = g.createLinearGradient(180, 0, 1868, 0);
    brandGradient.addColorStop(0, "#9cbba7");
    brandGradient.addColorStop(0.48, "#f2dfb7");
    brandGradient.addColorStop(1, "#6f9e81");
    g.shadowColor = "#7eb398";
    g.shadowBlur = 10;
    g.strokeStyle = brandGradient;
    g.strokeText(PRODUCT, 1024, 168, 1880);
    g.shadowBlur = 0;
    g.lineWidth = 5;
    g.strokeStyle = "#e9f4ec";
    g.strokeText(PRODUCT, 1024, 168, 1880);
  }, textScale);
  const neon = (text: string, color: string) =>
    texture(1024, 256, (g) => {
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `700 144px ${DISPLAY}`;
      g.lineWidth = 5;
      g.shadowColor = color;
      g.shadowBlur = 14;
      g.strokeStyle = color;
      g.strokeText(text, 512, 136, 960);
      g.shadowBlur = 0;
      g.lineWidth = 2;
      g.strokeStyle = "#e9f4ec";
      g.strokeText(text, 512, 136, 960);
    }, textScale);
  // Puddles: the ground is glossy where alpha is low (the mirrored street shows through)
  const puddles = texture(1024, 1024, (g) => {
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 1024, 1024);
    const r = rng(7);
    for (let i = 0; i < 80; i++) {
      const x = r() * 1024, y = r() * 1024, s = 60 + r() * 180;
      const grd = g.createRadialGradient(x, y, 0, x, y, s);
      grd.addColorStop(0, "rgba(0,0,0,0.9)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(x - s, y - s, s * 2, s * 2);
    }
  });
  puddles.colorSpace = THREE.NoColorSpace;
  puddles.wrapS = puddles.wrapT = THREE.RepeatWrapping;
  puddles.repeat.set(4, 4);

  // Inside the window: a bright top fading down, with soft vertical light bands
  const interior = texture(512, 1024, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 1024);
    grd.addColorStop(0, "#f2f8ff");
    grd.addColorStop(0.5, "#b9cde0");
    grd.addColorStop(1, "#6f86a0");
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 1024);
    for (let x = 0; x < 512; x += 128) {
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(x + 40, 0, 48, 1024);
    }
  });
  // A faint diagonal highlight on the glass
  const sheen = texture(512, 512, (g) => {
    g.fillStyle = "rgba(200,225,255,0.08)";
    g.fillRect(0, 0, 512, 512);
    const grd = g.createLinearGradient(0, 0, 512, 512);
    grd.addColorStop(0.3, "rgba(255,255,255,0)");
    grd.addColorStop(0.42, "rgba(255,255,255,0.22)");
    grd.addColorStop(0.5, "rgba(255,255,255,0)");
    grd.addColorStop(0.62, "rgba(255,255,255,0.1)");
    grd.addColorStop(0.68, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
  });
  const grille = texture(1024, 64, (g) => {
    g.fillStyle = "#0b0e14";
    g.fillRect(0, 0, 1024, 64);
    g.fillStyle = "#2a3140";
    for (let x = 8; x < 1024; x += 24) g.fillRect(x, 12, 12, 40);
  });
  // A soft radial halo for light spill
  const glow = texture(512, 512, (g) => {
    const grd = g.createRadialGradient(256, 256, 0, 256, 256, 256);
    grd.addColorStop(0, "rgba(255,255,255,0.8)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.25)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
  });

  // The package code display above the tray.
  const slot = texture(
    1024,
    256,
    (g) => drawSlot(g, "----", false, copy),
    textScale,
  );
  // Condensation: a pale fog with droplets, drawn fresh each frame with the wipes cut out of it
  const drops = document.createElement("canvas");
  drops.width = FOG_W;
  drops.height = FOG_H;
  const dg = drops.getContext("2d")!;
  const r = rng(11);
  for (let i = 0; i < 760; i++) {
    const x = r() * FOG_W, y = r() * FOG_H, s = 1 + r() * r() * 4.8;
    dg.fillStyle = `rgba(255,255,255,${0.12 + r() * 0.18})`;
    dg.beginPath();
    dg.arc(x, y, s, 0, Math.PI * 2);
    dg.fill();
  }
  const fog = texture(FOG_W, FOG_H, () => {});

  const open = neon(copy.careerHub.toLocaleUpperCase(copy.locale), CYAN);
  const cold = neon(copy.region.toLocaleUpperCase(copy.locale), MAGENTA);

  return {
    cans,
    slot,
    fog,
    setSlot(text: string, blink: boolean) {
      redraw(slot, (g) => drawSlot(g, text, blink, copy));
    },
    // clear: v positions (0 bottom … 1 top) of the LED strips, which stay clear because they warm the glass
    drawFog(now: number, wipes: Wipe[], clear: number[]) {
      redraw(fog, (g) => {
        g.globalCompositeOperation = "source-over";
        g.clearRect(0, 0, FOG_W, FOG_H);
        g.fillStyle = "rgba(201,216,210,0.16)";
        g.fillRect(0, 0, FOG_W, FOG_H);
        g.drawImage(drops, 0, 0);
        g.globalCompositeOperation = "destination-out";
        for (const v of clear) {
          const y = (1 - v) * FOG_H;
          const band = g.createLinearGradient(0, y - 22, 0, y + 22);
          band.addColorStop(0, "rgba(0,0,0,0)");
          band.addColorStop(0.5, "rgba(0,0,0,1)");
          band.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = band;
          g.fillRect(0, y - 22, FOG_W, 44);
        }
        for (const w of wipes) {
          const k = wipeStrength(now - w.at);
          if (k <= 0) continue;
          const x = w.u * FOG_W, y = (1 - w.v) * FOG_H;
          const dot = g.createRadialGradient(x, y, 0, x, y, WIPE_R);
          dot.addColorStop(0, `rgba(0,0,0,${k})`);
          dot.addColorStop(0.6, `rgba(0,0,0,${k * 0.8})`);
          dot.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = dot;
          g.fillRect(x - WIPE_R, y - WIPE_R, WIPE_R * 2, WIPE_R * 2);
        }
      });
    },
    interior,
    sheen,
    grille,
    glow,
    strips,
    selection,
    buttons,
    sign,
    open,
    cold,
    puddles,
    dispose() {
      [...cans, ...strips, ...buttons, slot, fog, selection, interior, sheen, grille, glow, sign, open, cold, puddles]
        .forEach((item) => item.dispose());
    },
  };
}

export type Labels = ReturnType<typeof makeLabels>;
export const disposeLabels = (labels: Labels) => labels.dispose();

export const loadLabels = async (
  plans: Plan[],
  copy: SceneLabels,
  textScale = 1,
) => {
  try {
    await labelsReady;
  } catch {
    // proceed safely
  }
  return makeLabels(plans, copy, textScale);
};

function solidTexture(color: string, alpha = 255): THREE.DataTexture {
  const normalized = color.startsWith("#") ? color.slice(1) : color;
  const parsed = /^[0-9a-f]{6}$/i.test(normalized)
    ? Number.parseInt(normalized, 16)
    : 0x9cbba7;
  const data = new Uint8Array([
    (parsed >> 16) & 0xff,
    (parsed >> 8) & 0xff,
    parsed & 0xff,
    alpha,
  ]);
  const result = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  result.colorSpace = THREE.SRGBColorSpace;
  result.magFilter = THREE.LinearFilter;
  result.minFilter = THREE.LinearFilter;
  result.generateMipmaps = false;
  result.needsUpdate = true;
  return result;
}

/**
 * Last-resort materials for environments where 2D canvas labels cannot be
 * allocated. The procedural machine geometry remains visible and selectable;
 * only text, reflections-on-labels, and animated condensation are simplified.
 */
export function makeFallbackLabels(plans: Plan[]): Labels {
  const cans = plans.map((plan) => solidTexture(plan.color));
  const strips = plans.map((plan) => solidTexture(plan.color));
  const buttons = plans.map((plan) => solidTexture(plan.color));
  const slot = solidTexture("#0a0203");
  const fog = solidTexture("#c9d8d2", 28);
  const selection = solidTexture("#07110d");
  const interior = solidTexture("#b9cde0");
  const sheen = solidTexture("#ffffff", 28);
  const grille = solidTexture("#2a3140");
  const glow = solidTexture("#ffffff", 150);
  const sign = solidTexture("#9cbba7");
  const open = solidTexture(CYAN, 180);
  const cold = solidTexture(MAGENTA, 180);
  const puddles = solidTexture("#7f8d84");
  const textures = [
    ...cans,
    ...strips,
    ...buttons,
    slot,
    fog,
    selection,
    interior,
    sheen,
    grille,
    glow,
    sign,
    open,
    cold,
    puddles,
  ];

  return {
    cans,
    slot,
    fog,
    setSlot() {},
    drawFog() {},
    interior,
    sheen,
    grille,
    glow,
    strips,
    selection,
    buttons,
    sign,
    open,
    cold,
    puddles,
    dispose() {
      textures.forEach((item) => item.dispose());
    },
  };
}
