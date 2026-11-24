import { createSupabaseServiceClient } from "@/server/db/supabase-server";
import { textNoStore } from "@/server/http/no-store-response";
import { verifyUnsubscribeSignature } from "@/server/email/unsubscribe-token-core";
import {
  isAppLocale,
  isRightToLeftLocale,
  routing,
  type AppLocale,
} from "@/i18n/routing";

export const dynamic = "force-dynamic";

const unsubscribeCopy: Record<
  AppLocale,
  {
    title: string;
    heading: string;
    description: string;
    button: string;
    note: string;
    removed: string;
  }
> = {
  tr: {
    title: "İşBul KKTC | E-posta aboneliği",
    heading: "Tanıtım e-postalarını durdurmak istiyor musunuz?",
    description:
      "Onayladığınızda bu adres İşBul KKTC tanıtım e-postalarından çıkarılır. Başvuru ve hesap güvenliği gibi işlem e-postaları bundan etkilenmez.",
    button: "Tanıtım e-postalarını durdur",
    note: "Bu sayfayı açmak aboneliğinizi değiştirmez. İşlem yalnızca düğmeye bastığınızda tamamlanır.",
    removed: "Bu adres tanıtım e-postalarından çıkarıldı.",
  },
  en: {
    title: "İşBul KKTC | Email preferences",
    heading: "Would you like to stop promotional emails?",
    description:
      "If you confirm, this address will stop receiving İşBul KKTC promotional emails. Application and account-security emails are not affected.",
    button: "Stop promotional emails",
    note: "Opening this page does not change your subscription. The change is made only when you select the button.",
    removed: "This address has been removed from promotional emails.",
  },
  ru: {
    title: "İşBul KKTC | Настройки электронной почты",
    heading: "Отключить рекламные письма?",
    description:
      "После подтверждения этот адрес перестанет получать рекламные письма İşBul KKTC. Письма о заявках и безопасности аккаунта продолжат приходить.",
    button: "Отключить рекламные письма",
    note: "Открытие этой страницы не меняет подписку. Изменение произойдёт только после нажатия кнопки.",
    removed: "Этот адрес исключён из рекламной рассылки.",
  },
  el: {
    title: "İşBul KKTC | Προτιμήσεις email",
    heading: "Θέλετε να σταματήσετε τα προωθητικά email;",
    description:
      "Αν επιβεβαιώσετε, αυτή η διεύθυνση θα σταματήσει να λαμβάνει προωθητικά email από το İşBul KKTC. Τα email αιτήσεων και ασφάλειας λογαριασμού δεν επηρεάζονται.",
    button: "Διακοπή προωθητικών email",
    note: "Το άνοιγμα αυτής της σελίδας δεν αλλάζει τη συνδρομή σας. Η αλλαγή γίνεται μόνο όταν επιλέξετε το κουμπί.",
    removed: "Αυτή η διεύθυνση αφαιρέθηκε από τα προωθητικά email.",
  },
  fa: {
    title: "İşBul KKTC | تنظیمات ایمیل",
    heading: "آیا می‌خواهید ایمیل‌های تبلیغاتی را متوقف کنید؟",
    description:
      "با تأیید، این نشانی دیگر ایمیل‌های تبلیغاتی İşBul KKTC را دریافت نمی‌کند. ایمیل‌های مربوط به درخواست‌های شغلی و امنیت حساب همچنان ارسال می‌شوند.",
    button: "توقف ایمیل‌های تبلیغاتی",
    note: "باز کردن این صفحه اشتراک شما را تغییر نمی‌دهد. تغییر فقط پس از انتخاب دکمه انجام می‌شود.",
    removed: "این نشانی از دریافت ایمیل‌های تبلیغاتی حذف شد.",
  },
  de: {
    title: "İşBul KKTC | E-Mail-Einstellungen",
    heading: "Möchten Sie keine Werbe-E-Mails mehr erhalten?",
    description:
      "Nach Ihrer Bestätigung erhält diese Adresse keine Werbe-E-Mails von İşBul KKTC mehr. E-Mails zu Bewerbungen und Kontosicherheit sind davon nicht betroffen.",
    button: "Werbe-E-Mails abbestellen",
    note: "Das Öffnen dieser Seite ändert Ihr Abonnement nicht. Die Änderung erfolgt erst, wenn Sie die Schaltfläche auswählen.",
    removed: "Diese Adresse wurde aus dem Werbeverteiler entfernt.",
  },
};

function getLocale(request: Request): AppLocale {
  const locale = new URL(request.url).searchParams.get("locale");
  return locale && isAppLocale(locale) ? locale : routing.defaultLocale;
}

function readParameters(request: Request): { email: string; signature: string } {
  const url = new URL(request.url);
  return {
    email: (url.searchParams.get("e") ?? "").trim().toLowerCase(),
    signature: url.searchParams.get("s") ?? "",
  };
}

function isValidUnsubscribeLink(email: string, signature: string): boolean {
  return (
    email.length >= 3 &&
    email.length <= 254 &&
    verifyUnsubscribeSignature(email, signature)
  );
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * A mailbox GET is only a preview. Security scanners routinely prefetch links;
 * mutating on GET would silently unsubscribe recipients who never clicked.
 */
function confirmationPage(request: Request, locale: AppLocale): Response {
  const url = new URL(request.url);
  const action = escapeHtmlAttribute(url.pathname + url.search);
  const copy = unsubscribeCopy[locale];
  const direction = isRightToLeftLocale(locale) ? "rtl" : "ltr";
  const html = `<!doctype html>
<html lang="${locale}" dir="${direction}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>${copy.title}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; padding: 32px 18px; background: #f4f7f5; color: #17251d; font: 16px/1.6 Arial, sans-serif; }
    main { box-sizing: border-box; width: min(100%, 560px); margin: 10vh auto; padding: 32px; border: 1px solid #dce5dd; border-radius: 18px; background: #fff; box-shadow: 0 16px 48px rgba(20, 50, 32, .08); }
    h1 { margin: 0 0 14px; font-size: 23px; line-height: 1.25; }
    p { margin: 0 0 14px; color: #53645a; }
    button { min-height: 48px; padding: 10px 20px; border: 0; border-radius: 999px; background: #176b45; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    button:focus-visible { outline: 3px solid #176b45; outline-offset: 3px; }
    small { display: block; margin-top: 18px; color: #66746c; }
  </style>
</head>
<body>
  <main>
    <h1>${copy.heading}</h1>
    <p>${copy.description}</p>
    <form method="post" action="${action}">
      <button type="submit">${copy.button}</button>
    </form>
    <small>${copy.note}</small>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/**
 * The POST handler serves both the explicit button above and RFC 8058
 * List-Unsubscribe-Post requests. Both carry the signed email in the URL.
 */
async function optOut(
  email: string,
  signature: string,
  locale: AppLocale,
): Promise<Response> {
  if (!isValidUnsubscribeLink(email, signature)) {
    return textNoStore("Invalid or expired unsubscribe link.", { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return textNoStore("Unsubscribe is temporarily unavailable.", {
      status: 503,
    });
  }

  const { error } = await supabase.rpc("opt_out_engagement", {
    _email: email,
    _reason: "email_link",
  });

  if (error) {
    console.error("Engagement opt-out could not be stored.", {
      code: error.code,
    });
    return textNoStore("Unsubscribe is temporarily unavailable.", {
      status: 503,
    });
  }

  return textNoStore(unsubscribeCopy[locale].removed, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

/**
 * GET is read-only so mailbox link scanners cannot unsubscribe a recipient.
 * The signed link is validated before rendering the human confirmation page.
 */
export async function GET(request: Request): Promise<Response> {
  const { email, signature } = readParameters(request);
  if (!isValidUnsubscribeLink(email, signature)) {
    return textNoStore("Invalid or expired unsubscribe link.", { status: 400 });
  }
  return confirmationPage(request, getLocale(request));
}

/**
 * POST is the only mutating path. Human confirmation forms and RFC 8058
 * one-click clients both POST the exact signed URL.
 */
export async function POST(request: Request): Promise<Response> {
  const { email, signature } = readParameters(request);
  return optOut(email, signature, getLocale(request));
}
