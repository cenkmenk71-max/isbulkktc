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

export const BRAND = {
  name: "İşBul KKTC",
  tagline: "Kuzey Kıbrıs'ın Güvenilir Kariyer ve İstihdam Ağı",
  domain: "isbulkktc.com",
  /** Canonical brand green — matches the app's `--green` token. */
  green: "#0D5C3A",
  greenDark: "#194435",
  ink: "#1A1A1A",
  inkSoft: "#5B6572",
  line: "#E6E4DE",
  surface: "#F5F2EB",
  white: "#FFFFFF",
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

export type EmailSection = {
  heading: string;
  /** Pre-escaped HTML for the section body. */
  html: string;
};

export type EmailButton = { label: string; url: string };

export type EmailLayoutOptions = {
  /** Inbox preview text; hidden in the body but read by most clients. */
  preheader: string;
  /** Page title; also the `<title>`. */
  heading: string;
  /** Pre-escaped HTML paragraphs shown before the sections. */
  introHtml?: string;
  sections?: EmailSection[];
  button?: EmailButton;
  /** Raw value shown verbatim (verification / OTP codes). */
  code?: string;
  /** Fallback text with the raw link under a button. */
  linkFallback?: string;
  /** Small muted note inside the card. */
  note?: string;
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
  return `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;font-weight:700;color:${BRAND.ink};" class="ibk-h1">${escapeHtml(
    heading,
  )}</h1>`;
}

function introBlock(html: string | undefined): string {
  if (!html) return "";
  return `<div style="font-size:15px;line-height:1.65;color:${BRAND.ink};">${html}</div>`;
}

function sectionBlock(section: EmailSection): string {
  return `<div style="margin:22px 0 0;">
<p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.green};">${escapeHtml(
    section.heading,
  )}</p>
<div style="font-size:15px;line-height:1.65;color:${BRAND.ink};">${section.html}</div>
</div>`;
}

function buttonBlock(button: EmailButton | undefined): string {
  if (!button || !isSafeUrl(button.url)) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 0;">
<tr><td align="center" bgcolor="${BRAND.green}" style="border-radius:8px;">
<a href="${escapeHtml(button.url)}" class="ibk-btn" style="display:inline-block;padding:14px 28px;color:${BRAND.white};text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">${escapeHtml(
    button.label,
  )}</a>
</td></tr>
</table>`;
}

function codeBlock(code: string | undefined): string {
  if (!code) return "";
  return `<div style="margin:22px 0 0;background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:10px;padding:20px;text-align:center;">
<span class="ibk-code" style="font-size:32px;font-weight:700;letter-spacing:6px;color:${BRAND.ink};">${escapeHtml(
    code,
  )}</span>
</div>`;
}

function linkFallbackBlock(text: string | undefined, url: string | undefined): string {
  if (!text || !url || !isSafeUrl(url)) return "";
  return `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${BRAND.inkSoft};word-break:break-all;">${escapeHtml(
    text,
  )}<br><a href="${escapeHtml(url)}" style="color:${BRAND.green};text-decoration:underline;">${escapeHtml(
    url,
  )}</a></p>`;
}

function noteBlock(note: string | undefined): string {
  if (!note) return "";
  return `<div style="margin:24px 0 0;background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:8px;padding:16px;font-size:13px;line-height:1.6;color:${BRAND.inkSoft};">${escapeHtml(
    note,
  )}</div>`;
}

function footerBlock(options: EmailLayoutOptions): string {
  const unsubscribe = options.unsubscribeUrl && isSafeUrl(options.unsubscribeUrl)
    ? ` · <a href="${escapeHtml(options.unsubscribeUrl)}" style="color:${BRAND.inkSoft};text-decoration:underline;">${escapeHtml(
        options.unsubscribeLabel ?? "Abonelikten çık",
      )}</a>`
    : "";
  return `<tr><td style="padding:22px 32px;background:#fbfbfa;border-top:1px solid ${BRAND.line};text-align:center;font-size:12px;line-height:1.7;color:${BRAND.inkSoft};">
<p style="margin:0 0 6px;">${escapeHtml(options.footerNote)}</p>
<p style="margin:0;">© ${new Date().getUTCFullYear()} ${BRAND.name} · Kuzey Kıbrıs Türk Cumhuriyeti · <a href="${escapeHtml(
    options.siteUrl,
  )}" style="color:${BRAND.green};text-decoration:none;">${BRAND.domain}</a>${unsubscribe}</p>
</td></tr>`;
}

export function renderEmailLayout(options: EmailLayoutOptions): string {
  const sections = (options.sections ?? []).map(sectionBlock).join("");
  const body = [
    headingBlock(options.heading),
    introBlock(options.introHtml),
    sections,
    codeBlock(options.code),
    buttonBlock(options.button),
    linkFallbackBlock(options.linkFallback, options.button?.url),
    noteBlock(options.note),
  ].join("");

  return `<!DOCTYPE html>
<html lang="tr">
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
    .ibk-h1 { font-size:19px !important; }
  }
  @media (prefers-color-scheme:dark) {
    .ibk-bg { background:#111413 !important; }
    .ibk-card { background:#1b1f1e !important; }
    .ibk-h1, .ibk-code { color:#f3f1ec !important; }
    .ibk-foot { background:#171b1a !important; }
  }
  [data-ogsc] .ibk-card { background:#1b1f1e !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
${preheaderBlock(options.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ibk-bg" style="background:${BRAND.surface};padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="ibk-card" style="max-width:600px;width:100%;background:${BRAND.white};border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.07);">
<tr><td class="ibk-pad" style="background:${BRAND.green};padding:26px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;">
<img src="${LOGO_URL}" width="56" height="33" alt="" style="display:block;border:0;outline:none;text-decoration:none;" />
</td>
<td style="vertical-align:middle;padding-left:14px;">
<div style="color:${BRAND.white};font-size:22px;font-weight:700;letter-spacing:-0.4px;line-height:1.1;">${BRAND.name}</div>
<div style="color:rgba(255,255,255,0.85);font-size:12.5px;margin-top:3px;">${BRAND.tagline}</div>
</td>
</tr></table>
</td></tr>
<tr><td class="ibk-pad" style="padding:32px;">
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
    lines.push(options.introHtml.replace(/<[^>]+>/g, "").trim(), "");
  }
  for (const section of options.sections ?? []) {
    lines.push(`${section.heading}: ${section.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`, "");
  }
  if (options.code) lines.push(options.code, "");
  if (options.button) lines.push(`${options.button.label}: ${options.button.url}`, "");
  if (options.note) lines.push(options.note, "");
  lines.push(options.footerNote, BRAND.domain);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
