/**
 * Branded transactional email shell shared by the notification worker.
 *
 * Inline-styled table markup because email clients strip stylesheets; this
 * mirrors `supabase/templates/*.html` so a notification looks like the auth
 * mail a user already received. Kept free of Deno globals so it is unit
 * testable from Node.
 */

export const BRAND = {
  name: "İşBul KKTC",
  tagline: "Kuzey Kıbrıs'ın Güvenilir Kariyer ve İstihdam Ağı",
  green: "#0D5C3A",
  ink: "#1A1A1A",
  inkSoft: "#5B6572",
  line: "#E6E4DE",
  surface: "#F5F2EB",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type BrandedEmailOptions = {
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
  siteUrl: string;
};

export function renderBrandedEmail(options: BrandedEmailOptions): string {
  const { preheader, heading, body, ctaLabel, ctaUrl, footerNote, siteUrl } =
    options;
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
<tr><td style="background:${BRAND.green};padding:28px 32px;">
<div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">${BRAND.name}</div>
<div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">${BRAND.tagline}</div>
</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 14px;font-size:18px;font-weight:700;color:${BRAND.ink};">${escapeHtml(heading)}</h1>
<div style="font-size:15px;line-height:1.65;color:${BRAND.ink};">${body}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 0;">
<tr><td style="border-radius:8px;background:${BRAND.green};">
<a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;">${escapeHtml(ctaLabel)}</a>
</td></tr>
</table>
<p style="margin:24px 0 0;font-size:13px;color:${BRAND.inkSoft};word-break:break-all;">${escapeHtml(ctaUrl)}</p>
</td></tr>
<tr><td style="padding:20px 32px;background:#fbfbfa;border-top:1px solid ${BRAND.line};text-align:center;font-size:12px;color:${BRAND.inkSoft};line-height:1.7;">
<p style="margin:0 0 6px;">${escapeHtml(footerNote)}</p>
<p style="margin:0;">Kuzey Kıbrıs Türk Cumhuriyeti · <a href="${siteUrl}" style="color:${BRAND.green};text-decoration:none;">isbulkktc.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
