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
 * The design scale.
 *
 * Every template read its sizes from a handful of hand-picked numbers — eight
 * font sizes, three radii, and paddings of 16, 20, 22, 26, 28 and 32 — which is
 * what made the set look flat and unordered. These tokens replace the ad-hoc
 * values so a template picks a step instead of inventing one.
 *
 * - Spacing is a 4px scale. Two steps are used per context, never an odd value.
 * - Type is a 1.2 modular scale, so each step is visibly larger than the last.
 * - Only two radii exist: a small control and the card.
 */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const TYPE = {
  /** Footer and legal fine print. */
  micro: 11,
  /** Secondary lines, fallback URLs, notes. */
  small: 13,
  /** Body copy. */
  body: 15,
  /** Lead paragraph, slightly above body. */
  lead: 17,
  /** Section heading. */
  h2: 20,
  /** Email title. */
  h1: 26,
  /** The one-off verification code, the only display size. */
  display: 34,
} as const;

export const RADIUS = {
  control: 8,
  card: 14,
} as const;

/** Line heights, paired with TYPE so text blocks are consistent. */
export const LEADING = {
  tight: 1.25,
  normal: 1.6,
  loose: 1.75,
} as const;

/** Absolute URL to the hosted brand mark, used as the email header logo. */
export const LOGO_URL = "https://isbulkktc.com/images/isbul-logo-mark-white.png";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Turn a pre-escaped HTML fragment into a plain-text line for the text
 * alternative. Tags are dropped and the entities `escapeHtml` introduces for
 * quotes and ampersands are decoded back, so the text part reads as prose
 * (`Kuzey Kıbrıs'ta`, `X & Y`) rather than as markup (`Kuzey Kıbrıs&#39;ta`).
 *
 * `&lt;`/`&gt;` are deliberately **not** decoded: they only appear when escaped
 * untrusted copy is echoed into a message, and keeping them escaped is what lets
 * the text part hold no `<` at all — the invariant the family tests assert.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Contact links are the only place a non-`http` scheme is allowed: `mailto:` and
 * `tel:` open the recipient's own client, and `https://wa.me/…` is the WhatsApp
 * deep link the site footer already uses. Anything else (a bare address with no
 * scheme, `javascript:`, `data:`) is dropped rather than rendered as a dead or
 * hostile link.
 */
function isSafeContactUrl(value: string): boolean {
  return /^(https?:\/\/|mailto:|tel:)/i.test(value);
}

/**
 * Right-to-left locales among the six the app ships. Only `fa` is RTL, so the
 * test is an explicit set rather than a Unicode-range guess. Kept here (not
 * imported from `@/i18n/routing`) because this module must stay globals-free
 * and dependency-free so it runs unchanged inside the Deno Edge Function and
 * the Node sender.
 */
const rtlLocales = new Set(["fa", "ar", "he", "ur"]);

/** Normalises a locale tag (`tr-TR`, `EN`) to the `lang` attribute value. */
function htmlLang(locale: string | undefined): string {
  const normalized = (locale ?? "tr").trim().toLowerCase().replace(/_/g, "-");
  const match = /^([a-z]{2,3})(?:-[a-z0-9]+)*$/.exec(normalized);
  return match ? normalized : "tr";
}

function isRtlLocale(locale: string): boolean {
  return rtlLocales.has(locale.split("-")[0] ?? "");
}

/**
 * Uppercases a heading with the *recipient's* language rules.
 *
 * This replaced `text-transform:uppercase`, which resolves with the client's
 * locale rather than the message's: for a Turkish body it mapped dotted `i` to
 * dotless `I`, so "işletmeniz" rendered as "IŞLETMENIZ" instead of "İŞLETMENİZ"
 * — the "i yerine ı" the owner reported. Outlook drops `text-transform`
 * entirely, so the same heading was left lowercase there. Pre-casing in the
 * sender fixes both and keeps the six locales consistent; a caseless locale
 * (`fa`) is unaffected.
 */
function uppercaseHeading(text: string, locale: string): string {
  try {
    return text.toLocaleUpperCase(locale);
  } catch {
    // An unknown-but-well-formed tag: fall back to the root locale rather than
    // throwing and losing the whole message.
    return text.toUpperCase();
  }
}

export type EmailSection = {
  heading: string;
  /** Pre-escaped HTML for the section body. */
  html: string;
};

export type EmailButton = {
  label: string;
  url: string;
  /**
   * Optional lead-in line rendered directly above the button. The marketing
   * family uses it so each action keeps the owner's own introducing sentence
   * ("Review the packages that fit your business:") instead of a bare button.
   */
  lead?: string;
};

/**
 * A reachable contact row rendered as a real, tappable link.
 *
 * `url` may be a `mailto:` or `tel:` URI as well as an `https:` one, so this
 * deliberately bypasses `isSafeUrl` (which only admits `http(s)`); the scheme is
 * validated separately in `isSafeContactUrl`.
 */
export type EmailContact = { label: string; value: string; url: string };

export type EmailLayoutOptions = {
  /**
   * Recipient locale (BCP-47), e.g. `tr`, `en`, `fa`. Drives `<html lang>` and
   * `dir` so a screen reader announces the message in the right language
   * (WCAG 3.1.1) and RTL copy (`fa`) aligns correctly. Defaults to `tr` when
   * omitted, which keeps legacy callers working.
   */
  locale?: string;
  /** Inbox preview text; hidden in the body but read by most clients. */
  preheader: string;
  /** Page title; also the `<title>`. */
  heading: string;
  /** Pre-escaped HTML paragraphs shown before the sections. */
  introHtml?: string;
  sections?: EmailSection[];
  /**
   * Pre-escaped HTML paragraphs shown after the sections and before the
   * actions. A marketing message uses this for the closing line and the lead-in
   * that introduces each call to action, so the buttons are not bare.
   */
  outroHtml?: string;
  button?: EmailButton;
  /**
   * A stacked set of calls to action, one full-width button per line, each with
   * an optional lead-in line above it. The single `button` is kept for the
   * transactional families that have exactly one action; a marketing message
   * uses this to offer a primary and a secondary path while keeping the order
   * and the introducing copy the owner wrote.
   */
  buttons?: EmailButton[];
  /** Raw value shown verbatim (verification / OTP codes). */
  code?: string;
  /** Fallback text with the raw link under a button. */
  linkFallback?: string;
  /** Small muted note inside the card. */
  note?: string;
  /**
   * Pre-escaped HTML paragraphs shown after the actions and before the contact
   * rows — the sign-off of a marketing message, and any heading that introduces
   * the contact block.
   */
  signatureHtml?: string;
  /**
   * Reachable contact channels, each rendered as a real tappable link. A
   * marketing mail carries these so a prospect can call, write or message the
   * team without copying an address out of the body.
   */
  contacts?: EmailContact[];
  /**
   * Small uppercase label shown above the contact rows, so a prospect can tell
   * at a glance that the block lists ways to reach the team.
   */
  contactsHeading?: string;
  footerNote: string;
  siteUrl: string;
  unsubscribeUrl?: string;
  /** Localized label for the unsubscribe link; defaults to the Turkish form. */
  unsubscribeLabel?: string;
};

/**
 * Injects hidden preheader text plus a run of zero-width non-joiners so the
 * client does not pull body copy into the preview line.
 */
function preheaderBlock(text: string): string {
  const padding = "\u200C\u00A0".repeat(60);
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(
    text,
  )}${padding}</div>`;
}

function headingBlock(heading: string): string {
  // The title is the one element that should outrank the section headings. It
  // was set to the h2 step, so a title and a section label looked identical —
  // the flatness the owner reported.
  return `<h1 style="margin:0 0 ${SPACE.md}px;font-size:${TYPE.h1}px;line-height:${LEADING.tight};font-weight:700;letter-spacing:-0.4px;color:${BRAND.ink};" class="ibk-h1">${escapeHtml(
    heading,
  )}</h1>`;
}

function introBlock(html: string | undefined): string {
  if (!html) return "";
  return `<div style="font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.ink};">${html}</div>`;
}

/**
 * A pre-escaped HTML block placed after another block rather than right under
 * the title, so unlike `introBlock` it carries a top margin. Used for the
 * marketing family's closing lines (before the actions) and its sign-off
 * (after them).
 */
function outroBlock(html: string | undefined): string {
  if (!html) return "";
  return `<div style="margin:${SPACE.lg}px 0 0;font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.ink};">${html}</div>`;
}

function sectionBlock(section: EmailSection, locale: string): string {
  return `<div style="margin:${SPACE.lg}px 0 0;">
<p style="margin:0 0 8px;font-size:${TYPE.small}px;font-weight:700;letter-spacing:0.04em;color:${BRAND.green};">${escapeHtml(
    uppercaseHeading(section.heading, locale),
  )}</p>
<div style="font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.ink};">${section.html}</div>
</div>`;
}

function buttonBlock(button: EmailButton | undefined): string {
  if (!button || !isSafeUrl(button.url)) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${SPACE.lg}px 0 0;">
<tr><td align="center" bgcolor="${BRAND.green}" style="border-radius:${RADIUS.control}px;">
<a href="${escapeHtml(button.url)}" class="ibk-btn" style="display:inline-block;padding:${SPACE.md}px ${SPACE.lg}px;color:${BRAND.white};text-decoration:none;font-weight:600;font-size:${TYPE.body}px;border-radius:${RADIUS.control}px;">${escapeHtml(
    button.label,
  )}</a>
</td></tr>
</table>`;
}

function buttonCell(button: EmailButton, secondary: boolean): string {
  if (!isSafeUrl(button.url)) return "";
  const bg = secondary ? BRAND.white : BRAND.green;
  const fg = secondary ? BRAND.green : BRAND.white;
  const border = secondary ? `border:1px solid ${BRAND.green};` : "";
  const lead = button.lead
    ? `<p style="margin:0 0 ${SPACE.sm}px;font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.ink};">${escapeHtml(
        button.lead,
      )}</p>`
    : "";
  return `<tr><td style="padding:${SPACE.md}px 0 0;">
${lead}<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;"><tr>
<td align="center" bgcolor="${bg}" style="border-radius:${RADIUS.control}px;${border}">
<a href="${escapeHtml(button.url)}" class="ibk-btn" style="display:block;padding:${SPACE.md}px ${SPACE.lg}px;color:${fg};text-decoration:none;font-weight:600;font-size:${TYPE.body}px;border-radius:${RADIUS.control}px;text-align:center;">${escapeHtml(
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
  return `<div style="margin:${SPACE.lg}px 0 0;background:${BRAND.muted};border:1px solid ${BRAND.line};border-radius:${RADIUS.control}px;padding:${SPACE.md}px;font-size:${TYPE.small}px;line-height:${LEADING.normal};color:${BRAND.inkSoft};">${escapeHtml(
    note,
  )}</div>`;
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
        `<tr><td style="padding:6px 0;font-size:${TYPE.body}px;line-height:${LEADING.normal};color:${BRAND.inkSoft};">${escapeHtml(
          contact.label,
        )}: <a href="${escapeHtml(contact.url)}" style="color:${BRAND.green};text-decoration:none;font-weight:600;">${escapeHtml(
          contact.value,
        )}</a></td></tr>`,
    )
    .join("");
  const title = heading
    ? `<p style="margin:0 0 4px;font-size:${TYPE.small}px;font-weight:700;letter-spacing:0.04em;color:${BRAND.green};">${escapeHtml(
        uppercaseHeading(heading, locale),
      )}</p>`
    : "";
  return `<div style="margin:${SPACE.lg}px 0 0;background:${BRAND.muted};border:1px solid ${BRAND.line};border-radius:${RADIUS.control}px;padding:${SPACE.md}px ${SPACE.lg}px;">
${title}<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${rows}</table>
</div>`;
}

/**
 * Renders the operator's published postal address as one line. Locality and
 * district first, country last, matching the site's own ordering.
 */
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
  return `<tr><td class="ibk-foot" style="padding:${SPACE.lg}px ${SPACE.xl}px;background:${BRAND.footer};border-top:1px solid ${BRAND.line};text-align:center;font-size:${TYPE.micro}px;line-height:${LEADING.loose};color:${BRAND.inkSoft};">
<p style="margin:0 0 6px;">${escapeHtml(options.footerNote)}</p>
<p style="margin:0 0 6px;">${escapeHtml(formatPostalAddress())}</p>
<p style="margin:0;">© ${new Date().getUTCFullYear()} ${BRAND.name} · <a href="${escapeHtml(
    options.siteUrl,
  )}" style="color:${BRAND.green};text-decoration:none;">${BRAND.domain}</a>${unsubscribe}</p>
</td></tr>`;
}

export function renderEmailLayout(options: EmailLayoutOptions): string {
  const lang = htmlLang(options.locale);
  const sections = (options.sections ?? []).map((section) => sectionBlock(section, lang)).join("");
  const body = [
    headingBlock(options.heading),
    introBlock(options.introHtml),
    sections,
    codeBlock(options.code),
    outroBlock(options.outroHtml),
    buttonsBlock(options.buttons),
    buttonBlock(options.button),
    linkFallbackBlock(options.linkFallback, options.button?.url),
    noteBlock(options.note),
    outroBlock(options.signatureHtml),
    contactBlock(options.contacts, options.contactsHeading, lang),
  ].join("");

  const dir = isRtlLocale(lang) ? "rtl" : "ltr";

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
    .ibk-card { background:#222827 !important; }
    .ibk-h1, .ibk-code { color:#F3F1EC !important; }
    .ibk-foot { background:#171B1A !important; }
  }
  [data-ogsc] .ibk-card { background:#222827 !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
${preheaderBlock(options.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ibk-bg" style="background:${BRAND.surface};padding:${SPACE.xl}px ${SPACE.sm}px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="ibk-card" style="max-width:600px;width:100%;background:${BRAND.white};border-radius:${RADIUS.card}px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.07);">
<tr><td class="ibk-pad" style="background:${BRAND.green};padding:${SPACE.lg}px ${SPACE.xl}px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;">
<img src="${LOGO_URL}" width="56" height="33" alt="" style="display:block;border:0;outline:none;text-decoration:none;" />
</td>
<td style="vertical-align:middle;padding-${dir === "rtl" ? "right" : "left"}:14px;">
<div style="color:${BRAND.white};font-size:${TYPE.h1}px;font-weight:700;letter-spacing:-0.4px;line-height:1.1;">${BRAND.name}</div>
<div style="color:rgba(255,255,255,0.85);font-size:${TYPE.micro}px;margin-top:3px;">${BRAND.tagline}</div>
</td>
</tr></table>
</td></tr>
<tr><td class="ibk-pad" style="padding:${SPACE.xl}px;">
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
  if (options.introHtml) {
    // Tags become spaces, not nothing: the intro is several `<p>` paragraphs
    // (a greeting, then the opening copy), and joining them with no separator
    // would run the last word of one into the first of the next.
    lines.push(htmlToText(options.introHtml), "");
  }
  for (const section of options.sections ?? []) {
    // A heading that already ends in a colon (some copy includes it) must not
    // gain a second one.
    const separator = section.heading.trimEnd().endsWith(":") ? " " : ": ";
    lines.push(`${section.heading}${separator}${htmlToText(section.html)}`, "");
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
