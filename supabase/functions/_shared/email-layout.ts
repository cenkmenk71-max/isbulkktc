/**
 * Branded transactional email layout shared by every İşBul KKTC email.
 *
 * Table-based markup with inline styles: email clients strip stylesheets, and
 * Outlook's Word renderer ignores flex/grid, so the shell uses a single centred
 * 600px table with `role="presentation"`. A `<style>` block adds the few things
 * inline styles cannot express (dark mode, hover, mobile padding) and is treated
 * as progressive enhancement — the email is fully legible without it.
 *
 * Kept free of Deno and Node globals so the same shell renders inside the
 * Supabase Edge Function and inside Node server actions, and stays unit
 * testable with plain `node --test`.
 */

/**
 * Brand colours, lifted from the app's design tokens in
 * `src/styles/global.css` so an email and the site never drift apart.
 * `tests/unit/design-tokens.test.ts` pins the same hex values on the CSS side.
 */
export const BRAND = {
  name: "İşBul KKTC",
  tagline: "Kuzey Kıbrıs'ın Güvenilir Kariyer ve İstihdam Ağı",
  domain: "isbulkktc.com",
  /** Primary green — the app's `--green` token (shade-green-800). */
  green: "#194435",
  /** Hover/pressed green — the app's `--green-hover` token (shade-green-900). */
  greenDark: "#123128",
  /** Soft green wash — the app's `--green-soft` token (shade-green-100). */
  greenSoft: "#E2ECE5",
  /** Primary ink — the app's `--ink` token (vanadium-950). */
  ink: "#171B1A",
  /** Secondary ink — the app's `--ink-3` token (vanadium-700). */
  inkSoft: "#414846",
  /** Hairline borders — the app's `--line` token (vanadium-200). */
  line: "#D1D5D0",
  /**
   * Page background. Pure white by design: a tinted canvas reads as a bulk
   * mailer to spam filters and to the eye, so the shell sits on `#FFFFFF`.
   */
  surface: "#FFFFFF",
  white: "#FFFFFF",
  /** Inset callout background — the app's `--muted` token (vanadium-50). */
  muted: "#F0F1ED",
  /** Footer band — the app's `--surface` token (crayon-surface). */
  footer: "#FAF8F3",
  /**
   * The operator's published location, mirrored verbatim from the site's own
   * organization graph (`src/content/ai-visibility/site.ts`: `LOCATION_LOCALITY`,
   * `LOCATION_DISTRICT` and `regionNames.tr`). A commercial message must carry a
   * valid physical postal address; the operator publishes its location at
   * locality/district granularity only — no street and no postal code — so the
   * footer states exactly that rather than inventing a more precise one.
   * `tests/unit/email-templates.test.ts` pins these values against the site.
   */
  postalAddress: {
    locality: "Alsancak",
    district: "Girne",
    country: "Kuzey Kıbrıs Türk Cumhuriyeti",
  },
} as const;

/**
 * The design scale — professional email typography and spacing system.
 */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const TYPE = {
  micro: 11,
  small: 13,
  body: 15,
  lead: 17,
  h2: 20,
  h1: 28,
  display: 36,
} as const;

export const RADIUS = {
  control: 10,
  card: 16,
  pill: 999,
} as const;

export const LEADING = {
  tight: 1.25,
  normal: 1.6,
  loose: 1.75,
} as const;

/** Absolute URL to the hosted brand mark, used as the email header logo. */
export const LOGO_URL = "https://isbulkktc.com/images/isbul-logo-mark-white.png";
export const LOGO_URL_DARK = "https://isbulkktc.com/images/isbul-logo-mark-dark.png";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeUrl(value: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(value);
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/'/g, "'")
    .replace(/"/g, '"')
    .replace(/&/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isSafeContactUrl(value: string): boolean {
  return /^(https?:\/\/|mailto:|tel:)/i.test(value);
}

const rtlLocales = new Set(["fa", "ar", "he", "ur"]);

function htmlLang(locale: string | undefined): string {
  const normalized = (locale ?? "tr").trim().toLowerCase().replace(/_/g, "-");
  const match = /^([a-z]{2,3})(?:-[a-z0-9]+)*$/.exec(normalized);
  return match ? normalized : "tr";
}

function isRtlLocale(locale: string): boolean {
  return rtlLocales.has(locale.split("-")[0] ?? "");
}

function uppercaseHeading(text: string, locale: string): string {
  try {
    return text.toLocaleUpperCase(locale);
  } catch {
    return text.toUpperCase();
  }
}

export type EmailSection = {
  heading: string;
  html: string;
};

export type EmailButton = {
  label: string;
  url: string;
  lead?: string;
};

export type EmailContact = { label: string; value: string; url: string };

export type EmailLayoutOptions = {
  locale?: string;
  preheader: string;
  heading: string;
  introHtml?: string;
  sections?: EmailSection[];
  outroHtml?: string;
  button?: EmailButton;
  buttons?: EmailButton[];
  code?: string;
  linkFallback?: string;
  note?: string;
  signatureHtml?: string;
  contacts?: EmailContact[];
  contactsHeading?: string;
  footerNote: string;
  siteUrl: string;
  unsubscribeUrl?: string;
  unsubscribeLabel?: string;
  /** Marketing-specific: hero section with hook, features, packages */
  hero?: {
    hook: string;
    subhook?: string;
    cta?: EmailButton;
  };
  features?: Array<{
    icon: string;
    title: string;
    body: string;
  }>;
  packages?: Array<{
    name: string;
    price: string;
    period: string;
    highlights: string[];
    cta: EmailButton;
    popular?: boolean;
  }>;
};

function preheaderBlock(text: string): string {
  const padding = "\u200C\u00A0".repeat(60);
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(
    text,
  )}${padding}</div>`;
}

function heroBlock(hero: EmailLayoutOptions["hero"], locale: string): string {
  if (!hero) return "";
  const _dir = isRtlLocale(locale) ? "rtl" : "ltr";
  const subhook = hero.subhook
    ? `<p style="margin:${SPACE.sm}px 0 0;font-size:${TYPE.lead}px;line-height:${LEADING.normal};color:rgba(255,255,255,0.9);font-weight:400;">${escapeHtml(hero.subhook)}</p>`
    : "";
  const cta = hero.cta && isSafeUrl(hero.cta.url)
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${SPACE.lg}px 0 0;">
       <tr><td align="center">
         <a href="${escapeHtml(hero.cta.url)}" style="display:inline-block;background:#FFFFFF;color:${BRAND.green};text-decoration:none;font-weight:700;font-size:${TYPE.body}px;border-radius:${RADIUS.pill}px;padding:${SPACE.md}px ${SPACE.xl}px;box-shadow:0 4px 14px rgba(0,0,0,0.15);">${escapeHtml(hero.cta.label)}</a>
       </td></tr></table>`
    : "";
  return `<tr><td style="background:${BRAND.green};border-radius:${RADIUS.card}px ${RADIUS.card}px 0 0;padding:${SPACE.xxl}px ${SPACE.xl}px;text-align:center;">
    <p style="margin:0 0 ${SPACE.xs}px;font-size:${TYPE.small}px;font-weight:700;letter-spacing:0.1em;color:rgba(255,255,255,0.8);">${escapeHtml("🎯 ÖZEL TEKLİF".toLocaleUpperCase(locale))}</p>
    <h1 style="margin:0 0 ${SPACE.sm}px;font-size:${TYPE.h1}px;line-height:${LEADING.tight};font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">${escapeHtml(hero.hook)}</h1>
    ${subhook}
    ${cta}
  </td></tr>`;
}

function headingBlock(heading: string): string {
  return `<h1 style="margin:0 0 ${SPACE.md}px;font-size:${TYPE.h1}px;line-height:${LEADING.tight};font-weight:800;letter-spacing:-0.5px;color:${BRAND.ink};">${escapeHtml(
    heading,
  )}</h1>`;
}

function introBlock(html: string | undefined): string {
  if (!html) return "";
  return `<div style="font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.ink};">${html}</div>`;
}

function outroBlock(html: string | undefined): string {
  if (!html) return "";
  return `<div style="margin:${SPACE.lg}px 0 0;font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.ink};">${html}</div>`;
}

function sectionBlock(section: EmailSection, locale: string): string {
  return `<div style="margin:${SPACE.lg}px 0 0;">
  <p style="margin:0 0 ${SPACE.sm}px;font-size:${TYPE.small}px;font-weight:700;letter-spacing:0.06em;color:${BRAND.green};">${escapeHtml(
    uppercaseHeading(section.heading, locale),
  )}</p>
  <div style="font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.ink};">${section.html}</div>
</div>`;
}

function featuresBlock(
  features: Array<{ icon: string; title: string; body: string }> | undefined,
): string {
  if (!features || features.length === 0) return "";
  const rows = features
    .map(
      (feature) => `
    <tr>
      <td style="vertical-align:top;padding:${SPACE.md}px ${SPACE.md}px ${SPACE.lg}px 0;width:48px;">
        <span style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:${BRAND.greenSoft};border-radius:${RADIUS.control}px;font-size:20px;line-height:1;">${feature.icon}</span>
      </td>
      <td style="vertical-align:top;padding:${SPACE.md}px 0 ${SPACE.lg}px;font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.ink};">
        <strong style="font-size:${TYPE.body}px;font-weight:700;color:${BRAND.ink};">${escapeHtml(feature.title)}</strong>
        <p style="margin:${SPACE.xs}px 0 0;font-weight:400;color:${BRAND.inkSoft};">${escapeHtml(feature.body)}</p>
      </td>
    </tr>`,
    )
    .join("");
  return `<div style="margin:${SPACE.xl}px 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${rows}</table>
  </div>`;
}

function packagesBlock(
  packages: Array<{
    name: string;
    price: string;
    period: string;
    highlights: string[];
    cta: EmailButton;
    popular?: boolean;
  }> | undefined,
): string {
  if (!packages || packages.length === 0) return "";
  const cards = packages
    .map((pkg, _index) => {
      const isPopular = pkg.popular === true;
      const border = isPopular ? `border:2px solid ${BRAND.green};` : `border:1px solid ${BRAND.line};`;
      const badge = isPopular
        ? `<div style="position:absolute;top:-10px;right:${SPACE.lg}px;background:${BRAND.green};color:#FFFFFF;font-size:${TYPE.micro}px;font-weight:700;padding:4px 10px;border-radius:${RADIUS.pill}px;">${escapeHtml("En Popüler")}</div>`
        : "";
      const highlights = pkg.highlights
        .map(
          (h) => `<li style="margin:0 0 ${SPACE.xs}px;padding-left:${SPACE.md}px;position:relative;font-size:${TYPE.small}px;line-height:${LEADING.normal};color:${BRAND.inkSoft};"><span style="position:absolute;left:0;top:2px;color:${BRAND.green};font-weight:700;">✓</span>${escapeHtml(h)}</li>`,
        )
        .join("");
      const cta = pkg.cta && isSafeUrl(pkg.cta.url)
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${SPACE.lg}px 0 0;width:100%;">
           <tr><td align="center">
             <a href="${escapeHtml(pkg.cta.url)}" style="display:block;background:${isPopular ? BRAND.green : BRAND.white};color:${isPopular ? BRAND.white : BRAND.green};text-decoration:none;font-weight:700;font-size:${TYPE.body}px;border-radius:${RADIUS.control}px;padding:${SPACE.md}px ${SPACE.lg}px;text-align:center;${isPopular ? "" : `border:2px solid ${BRAND.green};`}">${escapeHtml(pkg.cta.label)}</a>
           </td></tr></table>`
        : "";
      return `
      <!--[if mso]>
      <td width="50%" valign="top">
      <![endif]-->
      <div style="display:inline-block;vertical-align:top;width:100%;min-width:280px;max-width:300px;margin:0 ${SPACE.xs}px;position:relative;${border}background:${BRAND.white};border-radius:${RADIUS.card}px;box-shadow:0 2px 8px rgba(0,0,0,0.04);${isPopular ? `box-shadow:0 8px 24px rgba(25,68,53,0.12);` : ""}">
        ${badge}
        <div style="padding:${SPACE.xl}px;">
          <p style="margin:0 0 ${SPACE.xs}px;font-size:${TYPE.small}px;font-weight:700;letter-spacing:0.06em;color:${BRAND.green};">${escapeHtml(pkg.name.toUpperCase())}</p>
          <p style="margin:0 0 ${SPACE.xs}px;font-size:${TYPE.display}px;font-weight:800;letter-spacing:-1px;color:${BRAND.ink};line-height:1;">${escapeHtml(pkg.price)}<span style="font-size:${TYPE.small}px;font-weight:400;color:${BRAND.inkSoft};vertical-align:super;">/${escapeHtml(pkg.period)}</span></p>
          <ul style="margin:${SPACE.lg}px 0 0;padding:0;list-style:none;">${highlights}</ul>
          ${cta}
        </div>
      </div>
      <!--[if mso]>
      </td>
      <![endif]-->
    `;
    })
    .join("");
  return `
  <div style="margin:${SPACE.xl}px 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;"><tr>
      <td align="center" style="font-size:0;line-height:0;">${cards}</td>
    </tr></table>
  </div>`;
}

function buttonCell(button: EmailButton, secondary: boolean): string {
  if (!isSafeUrl(button.url)) return "";
  const bg = secondary ? BRAND.white : BRAND.green;
  const fg = secondary ? BRAND.green : BRAND.white;
  const border = secondary ? `border:2px solid ${BRAND.green};` : "";
  const lead = button.lead
    ? `<p style="margin:0 0 ${SPACE.sm}px;font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.ink};">${escapeHtml(
        button.lead,
      )}</p>`
    : "";
  return `<tr><td style="padding:${SPACE.md}px 0 0;">
${lead}<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;"><tr>
<td align="center" bgcolor="${bg}" style="border-radius:${RADIUS.control}px;${border}">
<a href="${escapeHtml(button.url)}" class="ibk-btn" style="display:block;padding:${SPACE.md}px ${SPACE.lg}px;color:${fg};text-decoration:none;font-weight:700;font-size:${TYPE.body}px;border-radius:${RADIUS.control}px;text-align:center;">${escapeHtml(
    button.label,
  )}</a>
</td></tr></table>
</td></tr>`;
}

function buttonsBlock(buttons: EmailButton[] | undefined): string {
  const usable = (buttons ?? []).filter((button) => isSafeUrl(button.url));
  if (usable.length === 0) return "";
  if (usable.length === 1 && !usable[0].lead) return buttonBlock(usable[0]);
  const rows = usable
    .map((button, index) => buttonCell(button, index > 0))
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${SPACE.sm}px 0 0;width:100%;">${rows}</table>`;
}

function buttonBlock(button: EmailButton | undefined): string {
  if (!button || !isSafeUrl(button.url)) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${SPACE.lg}px 0 0;">
<tr><td align="center" bgcolor="${BRAND.green}" style="border-radius:${RADIUS.control}px;">
<a href="${escapeHtml(button.url)}" class="ibk-btn" style="display:inline-block;padding:${SPACE.md}px ${SPACE.xl}px;color:${BRAND.white};text-decoration:none;font-weight:700;font-size:${TYPE.body}px;border-radius:${RADIUS.control}px;">${escapeHtml(
    button.label,
  )}</a>
</td></tr>
</table>`;
}

function codeBlock(code: string | undefined): string {
  if (!code) return "";
  return `<div style="margin:${SPACE.lg}px 0 0;background:${BRAND.muted};border:1px solid ${BRAND.line};border-radius:${RADIUS.control}px;padding:${SPACE.lg}px;text-align:center;">
<span class="ibk-code" style="font-size:${TYPE.display}px;font-weight:700;letter-spacing:6px;color:${BRAND.ink};">${escapeHtml(
    code,
  )}</span>
</div>`;
}

function linkFallbackBlock(text: string | undefined, url: string | undefined): string {
  if (!text || !url || !isSafeUrl(url)) return "";
  return `<p style="margin:${SPACE.lg}px 0 0;font-size:${TYPE.small}px;line-height:${LEADING.normal};color:${BRAND.inkSoft};word-break:break-all;">${escapeHtml(
    text,
  )}<br><a href="${escapeHtml(url)}" style="color:${BRAND.green};text-decoration:underline;">${escapeHtml(
    url,
  )}</a></p>`;
}

function noteBlock(note: string | undefined): string {
  if (!note) return "";
  return `<div style="margin:${SPACE.lg}px 0 0;background:${BRAND.greenSoft};border:1px solid ${BRAND.green};border-radius:${RADIUS.control}px;padding:${SPACE.md}px ${SPACE.lg}px;font-size:${TYPE.small}px;line-height:${LEADING.normal};color:${BRAND.green};">
${escapeHtml(note)}
</div>`;
}

function contactBlock(
  contacts: EmailContact[] | undefined,
  heading: string | undefined,
  locale: string,
): string {
  const usable = (contacts ?? []).filter((contact) => isSafeContactUrl(contact.url));
  if (usable.length === 0) return "";
  const rows = usable
    .map(
      (contact) =>
        `<tr><td style="padding:${SPACE.sm}px 0;font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.inkSoft};">${escapeHtml(
          contact.label,
        )}: <a href="${escapeHtml(contact.url)}" style="color:${BRAND.green};text-decoration:none;font-weight:600;">${escapeHtml(
          contact.value,
        )}</a></td></tr>`,
    )
    .join("");
  const title = heading
    ? `<p style="margin:0 0 ${SPACE.sm}px;font-size:${TYPE.small}px;font-weight:700;letter-spacing:0.06em;color:${BRAND.green};">${escapeHtml(
        uppercaseHeading(heading, locale),
      )}</p>`
    : "";
  return `<div style="margin:${SPACE.xl}px 0 0;background:${BRAND.muted};border:1px solid ${BRAND.line};border-radius:${RADIUS.card}px;padding:${SPACE.lg}px ${SPACE.xl}px;">
${title}<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${rows}</table>
</div>`;
}

function formatPostalAddress(): string {
  const { locality, district, country } = BRAND.postalAddress;
  return `${locality}, ${district} · ${country}`;
}

function footerBlock(options: EmailLayoutOptions): string {
  const unsubscribe = options.unsubscribeUrl && isSafeUrl(options.unsubscribeUrl)
    ? ` · <a href="${escapeHtml(options.unsubscribeUrl)}" style="color:${BRAND.inkSoft};text-decoration:underline;">${escapeHtml(
        options.unsubscribeLabel ?? "Abonelikten çık",
      )}</a>`
    : "";
  return `<tr><td class="ibk-foot" style="padding:${SPACE.xl}px ${SPACE.xl}px;background:${BRAND.footer};border-top:1px solid ${BRAND.line};text-align:center;font-size:${TYPE.micro}px;line-height:${LEADING.loose};color:${BRAND.inkSoft};">
<p style="margin:0 0 ${SPACE.sm}px;">${escapeHtml(options.footerNote)}</p>
<p style="margin:0 0 ${SPACE.sm}px;">${escapeHtml(formatPostalAddress())}</p>
<p style="margin:0;">© ${new Date().getUTCFullYear()} ${BRAND.name} · <a href="${escapeHtml(
    options.siteUrl,
  )}" style="color:${BRAND.green};text-decoration:none;">${BRAND.domain}</a>${unsubscribe}</p>
</td></tr>`;
}

export function renderEmailLayout(options: EmailLayoutOptions): string {
  const lang = htmlLang(options.locale);
  const dir = isRtlLocale(lang) ? "rtl" : "ltr";
  
  const heroHtml = heroBlock(options.hero, lang);
  const sectionsHtml = (options.sections ?? []).map((section) => sectionBlock(section, lang)).join("");
  const featuresHtml = featuresBlock(options.features);
  const packagesHtml = packagesBlock(options.packages);
  
  const body = [
    heroHtml,
    `<div style="padding:${SPACE.xl}px;">`,
    headingBlock(options.heading),
    introBlock(options.introHtml),
    sectionsHtml,
    featuresHtml,
    packagesHtml,
    codeBlock(options.code),
    outroBlock(options.outroHtml),
    buttonsBlock(options.buttons),
    buttonBlock(options.button),
    linkFallbackBlock(options.linkFallback, options.button?.url),
    noteBlock(options.note),
    outroBlock(options.signatureHtml),
    contactBlock(options.contacts, options.contactsHeading, lang),
    `</div>`,
  ].join("");

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(options.heading)}</title>
<style>
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  a { -webkit-text-size-adjust:none; }
  .ibk-btn:hover { background-color:${BRAND.greenDark} !important; }
  @media (max-width:600px) {
    .ibk-pad { padding-left:20px !important; padding-right:20px !important; }
    .ibk-h1 { font-size:${TYPE.h2}px !important; }
  }
  @media (prefers-color-scheme:dark) {
    .ibk-bg { background:#171B1A !important; }
    .ibk-card { background:#1E2423 !important; }
    .ibk-h1, .ibk-code { color:#F3F1EC !important; }
    .ibk-foot { background:#171B1A !important; }
  }
  [data-ogsc] .ibk-card { background:#1E2423 !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
${preheaderBlock(options.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ibk-bg" style="background:${BRAND.surface};padding:${SPACE.xl}px ${SPACE.sm}px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="ibk-card" style="max-width:600px;width:100%;background:${BRAND.white};border-radius:${RADIUS.card}px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
${heroHtml ? `
<tr><td class="ibk-pad" style="background:${BRAND.green};padding:${SPACE.lg}px ${SPACE.xl}px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;">
<img src="${LOGO_URL}" width="56" height="33" alt="" style="display:block;border:0;outline:none;text-decoration:none;" />
</td>
<td style="vertical-align:middle;padding-${dir === "rtl" ? "right" : "left"}:14px;">
<div style="color:${BRAND.white};font-size:${TYPE.h1}px;font-weight:800;letter-spacing:-0.4px;line-height:1.1;">${BRAND.name}</div>
<div style="color:rgba(255,255,255,0.85);font-size:${TYPE.micro}px;margin-top:3px;">${BRAND.tagline}</div>
</td>
</tr></table>
</td></tr>
` : `
<tr><td class="ibk-pad" style="background:${BRAND.green};padding:${SPACE.lg}px ${SPACE.xl}px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;">
<img src="${LOGO_URL}" width="56" height="33" alt="" style="display:block;border:0;outline:none;text-decoration:none;" />
</td>
<td style="vertical-align:middle;padding-${dir === "rtl" ? "right" : "left"}:14px;">
<div style="color:${BRAND.white};font-size:${TYPE.h1}px;font-weight:800;letter-spacing:-0.4px;line-height:1.1;">${BRAND.name}</div>
<div style="color:rgba(255,255,255,0.85);font-size:${TYPE.micro}px;margin-top:3px;">${BRAND.tagline}</div>
</td>
</tr></table>
</td></tr>
`}
<tr><td class="ibk-pad" style="padding:0;">
${body}
</td></tr>
${footerBlock(options)}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Plain-text alternative with the same information, for accessibility filters. */
export function renderEmailText(options: EmailLayoutOptions): string {
  const lines: string[] = [options.heading, ""];
  if (options.hero?.hook) {
    lines.push(options.hero.hook, "");
  }
  if (options.hero?.cta && isSafeUrl(options.hero.cta.url)) {
    lines.push(`${options.hero.cta.label}: ${options.hero.cta.url}`, "");
  }
  if (options.introHtml) {
    lines.push(htmlToText(options.introHtml), "");
  }
  for (const section of options.sections ?? []) {
    const separator = section.heading.trimEnd().endsWith(":") ? " " : ": ";
    lines.push(`${section.heading}${separator}${htmlToText(section.html)}`, "");
  }
  if (options.features) {
    lines.push("ÖZELLİKLER:", "");
    for (const f of options.features) {
      lines.push(`• ${f.title}: ${f.body}`, "");
    }
  }
  if (options.packages) {
    lines.push("PAKETLER:", "");
    for (const p of options.packages) {
      lines.push(`${p.name} — ${p.price}/${p.period}`);
      for (const h of p.highlights) lines.push(`  ✓ ${h}`);
      lines.push("");
    }
  }
  if (options.code) lines.push(options.code, "");
  if (options.outroHtml) {
    lines.push(htmlToText(options.outroHtml), "");
  }
  for (const button of options.buttons ?? []) {
    if (isSafeUrl(button.url)) lines.push(`${button.label}: ${button.url}`);
  }
  if ((options.buttons ?? []).length > 0) lines.push("");
  if (options.button) lines.push(`${options.button.label}: ${options.button.url}`, "");
  if (options.note) lines.push(options.note, "");
  if (options.signatureHtml) {
    lines.push(htmlToText(options.signatureHtml), "");
  }
  for (const contact of options.contacts ?? []) {
    if (isSafeContactUrl(contact.url)) {
      lines.push(`${contact.label}: ${contact.value} (${contact.url})`);
    }
  }
  if ((options.contacts ?? []).length > 0) lines.push("");
  lines.push(options.footerNote, formatPostalAddress(), BRAND.domain);
  if (options.unsubscribeUrl && isSafeUrl(options.unsubscribeUrl)) {
    lines.push(
      `${options.unsubscribeLabel ?? "Abonelikten çık"}: ${options.unsubscribeUrl}`,
    );
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}