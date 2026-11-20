import { createSupabaseServiceClient } from "@/server/db/supabase-server";
import { textNoStore } from "@/server/http/no-store-response";
import { verifyMarketingConsentConfirmationToken } from "@/server/email/marketing-consent-token";

export const dynamic = "force-dynamic";

const PAGE_COPY = {
  tr: {
    title: "E-posta tercihinizi onaylayın",
    description: "İşBul KKTC tanıtım e-postalarını almak için tercihinizi aşağıdaki düğmeyle doğrulayın.",
    button: "Tanıtım e-postası iznimi onayla",
    success: "E-posta tercihiniz doğrulandı. Artık İşBul KKTC tanıtım e-postalarını alabilirsiniz.",
    unavailable: "Bu onay bağlantısı geçersiz, süresi dolmuş veya artık kullanılamıyor.",
    serviceError: "Tercihiniz şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.",
  },
  en: {
    title: "Confirm your email preference",
    description: "Confirm below to receive promotional emails from İşBul KKTC.",
    button: "Confirm promotional email consent",
    success: "Your email preference is confirmed. You may now receive promotional emails from İşBul KKTC.",
    unavailable: "This confirmation link is invalid, expired, or no longer available.",
    serviceError: "Your preference could not be saved right now. Please try again later.",
  },
  ru: {
    title: "Подтвердите настройку электронной почты",
    description: "Подтвердите ниже, чтобы получать рекламные письма от İşBul KKTC.",
    button: "Подтвердить согласие на рекламные письма",
    success: "Настройка электронной почты подтверждена. Теперь вы можете получать рекламные письма от İşBul KKTC.",
    unavailable: "Эта ссылка недействительна, срок её действия истёк или она больше недоступна.",
    serviceError: "Не удалось сохранить настройку. Повторите попытку позже.",
  },
  el: {
    title: "Επιβεβαιώστε την προτίμησή σας",
    description: "Επιβεβαιώστε παρακάτω για να λαμβάνετε προωθητικά email από το İşBul KKTC.",
    button: "Επιβεβαίωση συγκατάθεσης για email",
    success: "Η προτίμησή σας επιβεβαιώθηκε. Μπορείτε πλέον να λαμβάνετε προωθητικά email από το İşBul KKTC.",
    unavailable: "Αυτός ο σύνδεσμος είναι άκυρος, έχει λήξει ή δεν είναι πλέον διαθέσιμος.",
    serviceError: "Δεν ήταν δυνατή η αποθήκευση της προτίμησής σας. Δοκιμάστε ξανά αργότερα.",
  },
  fa: {
    title: "ترجیح ایمیل خود را تأیید کنید",
    description: "برای دریافت ایمیل‌های تبلیغاتی İşBul KKTC، ترجیح خود را در زیر تأیید کنید.",
    button: "تأیید رضایت دریافت ایمیل تبلیغاتی",
    success: "ترجیح ایمیل شما تأیید شد. اکنون ممکن است ایمیل‌های تبلیغاتی İşBul KKTC را دریافت کنید.",
    unavailable: "این پیوند تأیید نامعتبر است، منقضی شده یا دیگر در دسترس نیست.",
    serviceError: "در حال حاضر امکان ذخیره ترجیح شما وجود ندارد. لطفاً بعداً دوباره تلاش کنید.",
  },
  de: {
    title: "Bestätigen Sie Ihre E-Mail-Einstellung",
    description: "Bestätigen Sie unten, wenn Sie Werbe-E-Mails von İşBul KKTC erhalten möchten.",
    button: "Einwilligung für Werbe-E-Mails bestätigen",
    success: "Ihre E-Mail-Einstellung wurde bestätigt. Sie können nun Werbe-E-Mails von İşBul KKTC erhalten.",
    unavailable: "Dieser Bestätigungslink ist ungültig, abgelaufen oder nicht mehr verfügbar.",
    serviceError: "Ihre Einstellung konnte momentan nicht gespeichert werden. Bitte versuchen Sie es später erneut.",
  },
} as const;

const CONSENT_VERSION = "sales-lead-marketing-v1";
const MAX_FORM_BYTES = 4096;

function page(locale: keyof typeof PAGE_COPY, token: string, message?: string): string {
  const copy = PAGE_COPY[locale];
  const rtl = locale === "fa" ? "rtl" : "ltr";
  const escapedToken = token.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const content = message
    ? "<p role=\"status\">" + message + "</p>"
    : "<p>" + copy.description + "</p><form method=\"post\" action=\"/api/email/confirm-marketing\"><input type=\"hidden\" name=\"token\" value=\"" + escapedToken + "\"><button type=\"submit\">" + copy.button + "</button></form>";
  return "<!doctype html><html lang=\"" + locale + "\" dir=\"" + rtl + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"referrer\" content=\"no-referrer\"><title>" + copy.title + "</title><style>body{margin:0;padding:32px 18px;background:#f5f7f5;color:#17251d;font:16px/1.6 Arial,sans-serif}main{max-width:560px;margin:10vh auto;padding:32px;border:1px solid #dce5dd;border-radius:16px;background:#fff}h1{font-size:24px;line-height:1.25}button{min-height:48px;padding:10px 18px;border:0;border-radius:999px;background:#176b45;color:white;font:inherit;font-weight:700;cursor:pointer}button:focus-visible{outline:3px solid #176b45;outline-offset:3px}</style></head><body><main><h1>" + copy.title + "</h1>" + content + "</main></body></html>";
}

function htmlResponse(body: string, status = 200): Response {
  return textNoStore(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readBoundedFormBody(request: Request): Promise<string | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_FORM_BYTES) {
    await request.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FORM_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * GET is deliberately read-only: mailbox link scanners often prefetch links.
 * The visitor must press the button and submit POST before consent is activated.
 */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const claims = verifyMarketingConsentConfirmationToken(token);
  if (!claims) return textNoStore("Invalid or expired confirmation link.", { status: 400 });
  return htmlResponse(page(claims.locale, token));
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return textNoStore("Unsupported content type.", { status: 415 });
  }

  let raw: string | null;
  try {
    raw = await readBoundedFormBody(request);
  } catch {
    return textNoStore("Invalid request body.", { status: 400 });
  }
  if (raw === null) return textNoStore("Payload too large or invalid.", { status: 413 });

  const token = new URLSearchParams(raw).get("token") ?? "";
  const claims = verifyMarketingConsentConfirmationToken(token);
  if (!claims) return textNoStore("Invalid or expired confirmation link.", { status: 400 });

  const supabase = createSupabaseServiceClient();
  if (!supabase) return htmlResponse(PAGE_COPY[claims.locale].serviceError, 503);

  const { data, error } = await supabase.rpc("confirm_sales_lead_marketing_consent", {
    _lead_id: claims.leadId,
    _consent_version: CONSENT_VERSION,
    _email_hash: claims.emailHash,
  });

  if (error) {
    console.error("Marketing consent confirmation could not be stored.", {
      code: error.code,
    });
    return htmlResponse(PAGE_COPY[claims.locale].serviceError, 503);
  }
  if (data !== true) return htmlResponse(PAGE_COPY[claims.locale].unavailable, 410);

  return htmlResponse(page(claims.locale, "", PAGE_COPY[claims.locale].success));
}
