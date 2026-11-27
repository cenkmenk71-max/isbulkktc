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
  const withLinkDestinations = html.replace(
    /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, rawHref: string, label: string) => {
      const href = rawHref.replace(/&amp;/gi, "&");
      const visible = label.replace(/<[^>]+>/g, " ").trim();
      return href && visible !== href ? `${visible} (${href})` : visible;
    },
  );
  return withLinkDestinations
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
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
  secondary?: boolean;
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
    eyebrow?: string;
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
    audience: string;
    description: string;
    scope: string;
    durationLabel: string;
    accent: string;
    cta: EmailButton;
  }>;
};

function preheaderBlock(text: string): string {
  const padding = "\u200C\u00A0".repeat(60);
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(
    text,
  )}${padding}</div>`;
}

function bulletproofButton(
  button: EmailButton,
  secondary: boolean,
  options: { width?: number; height?: number; fontSize?: number; radius?: string } = {},
): string {
  if (!isSafeUrl(button.url)) return "";
  const background = secondary ? BRAND.white : BRAND.green;
  const foreground = secondary ? BRAND.green : BRAND.white;
  const fontSize = options.fontSize ?? TYPE.body;
  const textWidth = Array.from(button.label).length * fontSize * 0.62;
  const width = Math.min(options.width ?? 440, Math.max(160, Math.ceil(textWidth + 48)));
  const height = options.height ?? (textWidth + 48 > width ? 64 : 48);
  const radius = options.radius ?? "12%";
  const className = secondary ? "ibk-button-secondary" : "ibk-button-primary";
  const padding = secondary ? SPACE.md + "px " + SPACE.xl + "px" : SPACE.md + "px " + SPACE.lg + "px";
  const border = secondary ? "2px solid " + BRAND.green : "0";
  return '<!--[if mso]>\n' +
    '<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="' + escapeHtml(button.url) + '" style="height:' + height + 'px;v-text-anchor:middle;width:' + width + 'px;" arcsize="' + radius + '" strokecolor="' + BRAND.green + '" fillcolor="' + background + '">\n' +
    '<w:anchorlock/>\n' +
    '<center style="color:' + foreground + ';font-family:Arial,sans-serif;font-size:' + fontSize + 'px;font-weight:700;">' + escapeHtml(button.label) + '</center>\n' +
    '</v:roundrect>\n<![endif]--><!--[if !mso]><!-- -->\n' +
    '<a href="' + escapeHtml(button.url) + '" class="' + className + '" style="display:inline-block;padding:' + padding + ';background:' + background + ';color:' + foreground + ';text-decoration:none;font-weight:700;font-size:' + fontSize + 'px;line-height:' + LEADING.normal + ';border:' + border + ';border-radius:' + RADIUS.control + 'px;text-align:center;">' + escapeHtml(button.label) + '</a>' +
    '\n<!--<![endif]-->';
}
function heroBlock(hero: EmailLayoutOptions["hero"], locale: string): string {
  if (!hero) return "";
  const eyebrow = hero.eyebrow?.trim()
    ? uppercaseHeading(hero.eyebrow.trim(), locale)
    : BRAND.name.toLocaleUpperCase(locale);
  const subhook = hero.subhook
    ? `<p style="margin:${SPACE.sm}px 0 0;font-size:${TYPE.lead}px;line-height:${LEADING.normal};color:#EAF1EC;font-weight:400;">${escapeHtml(hero.subhook)}</p>`
    : "";
  const cta = hero.cta && isSafeUrl(hero.cta.url)
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${SPACE.lg}px 0 0;">
       <tr><td align="center" bgcolor="#FFFFFF" class="ibk-button-secondary-cell" style="border-radius:${RADIUS.pill}px;">
         ${bulletproofButton(hero.cta, true, { width: 360, radius: "50%" })}
       </td></tr></table>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 ${SPACE.xl}px;">
    <tr><td class="ibk-brand-bg" bgcolor="${BRAND.green}" style="background:${BRAND.green};border-radius:${RADIUS.card}px;padding:${SPACE.xxl}px ${SPACE.xl}px;text-align:left;">
      <p style="margin:0 0 ${SPACE.sm}px;font-size:${TYPE.micro}px;font-weight:700;letter-spacing:0.12em;color:#C9D9CF;">${escapeHtml(eyebrow)}</p>
      <h1 class="ibk-h1" style="margin:0;font-size:${TYPE.h1}px;line-height:${LEADING.tight};font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">${escapeHtml(hero.hook)}</h1>
      ${subhook}
      ${cta}
    </td></tr>
  </table>`;
}

function headingBlock(heading: string, hasHero: boolean): string {
  const tag = hasHero ? "h2" : "h1";
  return `<${tag} class="ibk-h1" style="margin:0 0 ${SPACE.md}px;font-size:${TYPE.h1}px;line-height:${LEADING.tight};font-weight:800;letter-spacing:-0.5px;color:${BRAND.ink};">${escapeHtml(
    heading,
  )}</${tag}>`;
}

function introBlock(html: string | undefined): string {
  if (!html) return "";
  return `<div style="font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.ink};">${html}</div>`;
}

function outroBlock(html: string | undefined): string {
  if (!html) return "";
  return `<div style="margin:${SPACE.lg}px 0 0;font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.ink};">${html}</div>`;
}

function sectionBlock(section: EmailSection, locale: string, hasHero: boolean): string {
  const tag = hasHero ? "h3" : "h2";
  return `<div style="margin:${SPACE.lg}px 0 0;">
  <${tag} style="margin:0 0 ${SPACE.sm}px;font-size:${TYPE.small}px;line-height:${LEADING.normal};font-weight:700;letter-spacing:0.06em;color:${BRAND.green};">${escapeHtml(
    uppercaseHeading(section.heading, locale),
  )}</${tag}>
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
      <td width="48" valign="top" style="padding:${SPACE.md}px ${SPACE.md}px ${SPACE.lg}px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" class="ibk-icon-bg" bgcolor="${BRAND.greenSoft}" style="width:40px;height:40px;background:${BRAND.greenSoft};border-radius:${RADIUS.control}px;">
          <tr><td align="center" valign="middle" style="font-size:18px;line-height:1;color:${BRAND.green};font-weight:700;" aria-hidden="true">${escapeHtml(feature.icon)}</td></tr>
        </table>
      </td>
      <td valign="top" style="padding:${SPACE.md}px 0 ${SPACE.lg}px;font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.ink};">
        <strong style="font-size:${TYPE.body}px;font-weight:700;color:${BRAND.ink};">${escapeHtml(feature.title)}</strong>
        <p style="margin:${SPACE.xs}px 0 0;font-weight:400;color:${BRAND.inkSoft};">${escapeHtml(feature.body)}</p>
      </td>
    </tr>`,
    )
    .join("");
  return `<div style="margin:${SPACE.lg}px 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${rows}</table>
  </div>`;
}

function packagesBlock(
  packages: EmailLayoutOptions["packages"],
  hasHero: boolean,
): string {
  if (!packages || packages.length === 0) return "";
  const titleTag = hasHero ? "h4" : "h3";
  const rows: string[] = [];
  for (let index = 0; index < packages.length; index += 2) {
    const pair = packages.slice(index, index + 2);
    const cells = pair.map((pkg) => {
      const accent = /^#[0-9a-f]{6}$/i.test(pkg.accent) ? pkg.accent : BRAND.green;
      const cta = isSafeUrl(pkg.cta.url)
        ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:${SPACE.lg}px 0 0;width:100%;">
            <tr><td align="center" bgcolor="${BRAND.green}" class="ibk-button-primary-cell" style="border-radius:${RADIUS.control}px;">
              ${bulletproofButton(pkg.cta, false, { width: 200, height: 44, fontSize: TYPE.small })}
            </td></tr>
          </table>`
        : "";
      return `<td class="ibk-package-cell" width="50%" valign="top" style="width:50%;padding:6px;vertical-align:top;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="ibk-package-card" bgcolor="${BRAND.white}" style="width:100%;background:${BRAND.white};border:1px solid ${BRAND.line};border-top:4px solid ${accent};border-radius:${RADIUS.card}px;">
          <tr><td style="padding:${SPACE.lg}px;">
            <p style="margin:0 0 ${SPACE.sm}px;font-size:${TYPE.micro}px;line-height:1.4;font-weight:700;letter-spacing:0.08em;color:${BRAND.green};">${escapeHtml(pkg.audience)}</p>
            <${titleTag} style="margin:0;font-size:${TYPE.h2}px;line-height:1.25;font-weight:800;letter-spacing:-0.3px;color:${BRAND.ink};">${escapeHtml(pkg.name)}</${titleTag}>
            <p style="margin:${SPACE.sm}px 0 0;min-height:44px;font-size:${TYPE.small}px;line-height:${LEADING.normal};color:${BRAND.inkSoft};">${escapeHtml(pkg.description)}</p>
            <p style="margin:${SPACE.md}px 0 0;padding:${SPACE.md}px 0;border-top:1px solid ${BRAND.line};border-bottom:1px solid ${BRAND.line};font-size:${TYPE.small}px;line-height:${LEADING.normal};font-weight:700;color:${BRAND.ink};">${escapeHtml(pkg.scope)}</p>
            <p style="margin:${SPACE.md}px 0 0;font-size:${TYPE.small}px;line-height:${LEADING.normal};color:${BRAND.inkSoft};">${escapeHtml(pkg.durationLabel)}</p>
${cta}
          </td></tr>
        </table>
      </td>`;
    });
    if (cells.length === 1) {
      cells.push('<td class="ibk-package-cell" width="50%" style="width:50%;padding:6px;">&nbsp;</td>');
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;margin:${SPACE.lg}px 0 0;">${rows.join("")}</table>`;
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
<td align="center" bgcolor="${bg}" class="${secondary ? "ibk-button-secondary-cell" : "ibk-button-primary-cell"}" style="border-radius:${RADIUS.control}px;${border}">
${bulletproofButton(button, secondary, { width: 440 })}
</td></tr></table>
</td></tr>`;
}

function buttonsBlock(buttons: EmailButton[] | undefined): string {
  const usable = (buttons ?? []).filter((button) => isSafeUrl(button.url));
  if (usable.length === 0) return "";
  if (usable.length === 1 && !usable[0].lead) return buttonBlock(usable[0], usable[0].secondary === true);
  const rows = usable
    .map((button, index) => buttonCell(button, index > 0 || button.secondary === true))
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${SPACE.sm}px 0 0;width:100%;">${rows}</table>`;
}

function buttonBlock(button: EmailButton | undefined, secondary = false): string {
  if (!button || !isSafeUrl(button.url)) return "";
  const bg = secondary ? BRAND.white : BRAND.green;
  const fg = secondary ? BRAND.green : BRAND.white;
  const border = secondary ? `border:2px solid ${BRAND.green};` : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${SPACE.lg}px 0 0;">
<tr><td align="center" bgcolor="${bg}" class="${secondary ? "ibk-button-secondary-cell" : "ibk-button-primary-cell"}" style="border-radius:${RADIUS.control}px;${border}">
${bulletproofButton(button, secondary, { width: 440 })}
</td></tr>
</table>`;
}

function codeBlock(code: string | undefined): string {
  if (!code) return "";
  return `<div class="ibk-panel" style="margin:${SPACE.lg}px 0 0;background:${BRAND.muted};border:1px solid ${BRAND.line};border-radius:${RADIUS.control}px;padding:${SPACE.lg}px;text-align:center;">
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
  return `<div class="ibk-soft-panel" style="margin:${SPACE.lg}px 0 0;background:${BRAND.greenSoft};border:1px solid ${BRAND.green};border-radius:${RADIUS.control}px;padding:${SPACE.md}px ${SPACE.lg}px;font-size:${TYPE.small}px;line-height:${LEADING.normal};color:${BRAND.green};">
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
  return `<div class="ibk-panel" style="margin:${SPACE.xl}px 0 0;background:${BRAND.muted};border:1px solid ${BRAND.line};border-radius:${RADIUS.card}px;padding:${SPACE.lg}px ${SPACE.xl}px;">
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
<p style="margin:0 0 ${SPACE.sm}px;"><a href="mailto:info@isbulkktc.com" style="color:${BRAND.green};text-decoration:none;font-weight:600;">info@isbulkktc.com</a> <span aria-hidden="true">·</span> Telefon & WhatsApp: +90 539 131 64 21</p>
<p style="margin:0 0 ${SPACE.sm}px;">${escapeHtml(formatPostalAddress())}</p>
<p style="margin:0;">© ${new Date().getUTCFullYear()} ${BRAND.name} · <a href="${escapeHtml(
    options.siteUrl,
  )}" style="color:${BRAND.green};text-decoration:none;">${BRAND.domain}</a>${unsubscribe}</p>
</td></tr>`;
}

export function renderEmailLayout(options: EmailLayoutOptions): string {
  const lang = htmlLang(options.locale);
  const dir = isRtlLocale(lang) ? "rtl" : "ltr";
  
  const hasHero = Boolean(options.hero);
  const heroHtml = heroBlock(options.hero, lang);
  const sectionsHtml = (options.sections ?? []).map((section) => sectionBlock(section, lang, hasHero)).join("");
  const featuresHtml = featuresBlock(options.features);
  const packagesHtml = packagesBlock(options.packages, hasHero);
  
  const body = [
    heroHtml,
    `<div class="ibk-content" style="padding:${SPACE.xl}px;">`,
    headingBlock(options.heading, hasHero),
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
    .ibk-package-cell { display:block !important; width:100% !important; padding:0 0 12px !important; }
    .ibk-brand-name { font-size:24px !important; }
    .ibk-brand-tagline { font-size:10px !important; line-height:1.35 !important; }
  }
  /* Dark mode is component-scoped. A global p/div/td colour override creates
     white-on-white text in package cards and secondary actions. */
  @media (prefers-color-scheme:dark) {
    .ibk-bg { background-color:#171B1A !important; }
    .ibk-card, .ibk-content-bg { background-color:#1E2423 !important; }
    .ibk-brand-bg { background-color:#123128 !important; }
    .ibk-content, .ibk-content p, .ibk-content div, .ibk-content td,
    .ibk-content span, .ibk-content strong, .ibk-content h1, .ibk-content h2,
    .ibk-content h3, .ibk-content h4, .ibk-content li, .ibk-content a {
      color:#F3F1EC !important;
    }
    .ibk-package-card, .ibk-panel, .ibk-soft-panel {
      background-color:#2A3430 !important;
      border-color:#46544D !important;
    }
    .ibk-icon-bg { background-color:#2C4037 !important; }
    .ibk-button-secondary-cell, .ibk-button-secondary {
      background-color:#2A3430 !important;
      border-color:#6FAA92 !important;
      color:#F3F1EC !important;
    }
    .ibk-button-primary-cell { background-color:#123128 !important; }
    .ibk-button-primary { color:#FFFFFF !important; }
    .ibk-foot { background-color:#171B1A !important; color:#C5CEC8 !important; }
    .ibk-foot a { color:#A9CBBB !important; }
  }

  /* Outlook.com / Outlook on the web exposes these attributes when its
     dark-theme engine rewrites an element. Repeat the scoped palette so the
     foreground and the surface always move together. */
  [data-ogsc] .ibk-content,
  [data-ogsc] .ibk-content p, [data-ogsc] .ibk-content div,
  [data-ogsc] .ibk-content td, [data-ogsc] .ibk-content span,
  [data-ogsc] .ibk-content strong, [data-ogsc] .ibk-content h1,
  [data-ogsc] .ibk-content h2, [data-ogsc] .ibk-content h3,
  [data-ogsc] .ibk-content h4, [data-ogsc] .ibk-content li,
  [data-ogsc] .ibk-content a,
  p[data-ogsc], div[data-ogsc], td[data-ogsc], span[data-ogsc],
  strong[data-ogsc], h1[data-ogsc], h2[data-ogsc], h3[data-ogsc],
  h4[data-ogsc], li[data-ogsc], a[data-ogsc] {
    color:#F3F1EC !important;
  }
  [data-ogsb] .ibk-card, [data-ogsb] .ibk-content-bg {
    background-color:#1E2423 !important;
  }
  [data-ogsb] .ibk-brand-bg { background-color:#123128 !important; }
  [data-ogsb] .ibk-package-card, [data-ogsb] .ibk-panel,
  [data-ogsb] .ibk-soft-panel {
    background-color:#2A3430 !important;
    border-color:#46544D !important;
  }
  [data-ogsb] .ibk-icon-bg { background-color:#2C4037 !important; }
  [data-ogsb] .ibk-button-secondary-cell {
    background-color:#2A3430 !important;
    border-color:#6FAA92 !important;
  }
  [data-ogsb] .ibk-button-primary-cell { background-color:#123128 !important; }
  [data-ogsb] .ibk-foot { background-color:#171B1A !important; }
  [data-ogsc] .ibk-foot { color:#C5CEC8 !important; }
  [data-ogsc] .ibk-foot a { color:#A9CBBB !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
<div lang="${lang}" dir="${dir}">
${preheaderBlock(options.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ibk-bg" style="width:100%;table-layout:fixed;background:${BRAND.surface};">
<tr><td align="center" style="padding:${SPACE.xl}px ${SPACE.sm}px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="ibk-card" style="max-width:600px;width:100%;table-layout:fixed;background:${BRAND.white};border-radius:${RADIUS.card}px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
${heroHtml ? `
<tr><td class="ibk-pad ibk-brand-bg" bgcolor="${BRAND.green}" style="background:${BRAND.green};padding:${SPACE.lg}px ${SPACE.xl}px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ibk-brand-table" style="width:100%;table-layout:fixed;"><tr>
<td width="56" style="width:56px;vertical-align:middle;">
<a href="${escapeHtml(options.siteUrl)}" style="display:inline-block;text-decoration:none;"><img src="${LOGO_URL}" width="56" height="33" alt="${BRAND.name}" style="display:block;border:0;outline:none;" /></a>
</td>
<td class="ibk-brand-copy" style="vertical-align:middle;padding-${dir === "rtl" ? "right" : "left"}:14px;word-wrap:break-word;">
<div class="ibk-brand-name" style="color:${BRAND.white};font-size:${TYPE.h1}px;font-weight:800;letter-spacing:-0.4px;line-height:1.1;">${BRAND.name}</div>
<div class="ibk-brand-tagline" style="color:rgba(255,255,255,0.85);font-size:${TYPE.micro}px;margin-top:3px;">${BRAND.tagline}</div>
</td>
</tr></table>
</td></tr>
` : `
<tr><td class="ibk-pad ibk-brand-bg" bgcolor="${BRAND.green}" style="background:${BRAND.green};padding:${SPACE.lg}px ${SPACE.xl}px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ibk-brand-table" style="width:100%;table-layout:fixed;"><tr>
<td width="56" style="width:56px;vertical-align:middle;">
<a href="${escapeHtml(options.siteUrl)}" style="display:inline-block;text-decoration:none;"><img src="${LOGO_URL}" width="56" height="33" alt="${BRAND.name}" style="display:block;border:0;outline:none;" /></a>
</td>
<td class="ibk-brand-copy" style="vertical-align:middle;padding-${dir === "rtl" ? "right" : "left"}:14px;word-wrap:break-word;">
<div class="ibk-brand-name" style="color:${BRAND.white};font-size:${TYPE.h1}px;font-weight:800;letter-spacing:-0.4px;line-height:1.1;">${BRAND.name}</div>
<div class="ibk-brand-tagline" style="color:rgba(255,255,255,0.85);font-size:${TYPE.micro}px;margin-top:3px;">${BRAND.tagline}</div>
</td>
</tr></table>
</td></tr>
`}
<tr><td class="ibk-pad ibk-content-bg" bgcolor="${BRAND.white}" style="padding:0;background:${BRAND.white};">
${body}
</td></tr>
${footerBlock(options)}
</table>
</td></tr>
</table>
</div>
</body>
</html>`;
}

/** Plain-text alternative with the same information, for accessibility filters. */
export function renderEmailText(options: EmailLayoutOptions): string {
  const lines: string[] = [options.heading, ""];
  if (options.hero?.hook) lines.push(options.hero.hook, "");
  if (options.hero?.subhook) lines.push(options.hero.subhook, "");
  if (options.hero?.cta && isSafeUrl(options.hero.cta.url)) {
    lines.push(`${options.hero.cta.label}: ${options.hero.cta.url}`, "");
  }
  if (options.introHtml) lines.push(htmlToText(options.introHtml), "");
  for (const section of options.sections ?? []) {
    const separator = section.heading.trimEnd().endsWith(":") ? " " : ": ";
    lines.push(`${section.heading}${separator}${htmlToText(section.html)}`, "");
  }
  if (options.features?.length) {
    for (const feature of options.features) {
      lines.push(`• ${feature.title}: ${feature.body}`, "");
    }
  }
  if (options.packages?.length) {
    for (const pkg of options.packages) {
      lines.push(`${pkg.name} — ${pkg.scope}`, pkg.description);
      lines.push(pkg.durationLabel);
      if (isSafeUrl(pkg.cta.url)) lines.push(`${pkg.cta.label}: ${pkg.cta.url}`);
      lines.push("");
    }
  }
  if (options.code) lines.push(options.code, "");
  if (options.outroHtml) lines.push(htmlToText(options.outroHtml), "");
  for (const button of options.buttons ?? []) {
    if (button.lead) lines.push(button.lead);
    if (isSafeUrl(button.url)) lines.push(`${button.label}: ${button.url}`);
  }
  if ((options.buttons ?? []).length) lines.push("");
  if (options.button && isSafeUrl(options.button.url)) {
    lines.push(`${options.button.label}: ${options.button.url}`, "");
  }
  if (options.linkFallback && options.button?.url && isSafeUrl(options.button.url)) {
    lines.push(options.linkFallback, options.button.url, "");
  }
  if (options.note) lines.push(options.note, "");
  if (options.signatureHtml) lines.push(htmlToText(options.signatureHtml), "");
  if (options.contactsHeading) lines.push(options.contactsHeading, "");
  for (const contact of options.contacts ?? []) {
    if (isSafeContactUrl(contact.url)) {
      lines.push(`${contact.label}: ${contact.value} (${contact.url})`);
    }
  }
  if ((options.contacts ?? []).length) lines.push("");
  lines.push(options.footerNote);
  lines.push("E-posta: info@isbulkktc.com (mailto:info@isbulkktc.com)");
  lines.push("Telefon & WhatsApp: +90 539 131 64 21");
  lines.push(formatPostalAddress(), BRAND.domain);
  if (options.unsubscribeUrl && isSafeUrl(options.unsubscribeUrl)) {
    lines.push(`${options.unsubscribeLabel ?? "Abonelikten çık"}: ${options.unsubscribeUrl}`);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
