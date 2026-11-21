/**
 * Six-locale copy for GoTrue invitation, magic-link and email-change messages.
 * Kept separate from the core auth catalog so every locale stays explicit.
 */
import { resolveEmailLocale, type EmailLocale } from "./email-copy.ts";

export type NativeAuthExtraCopy = {
  invite: { subject: string; heading: string; lead: string; cta: string; fallback: string; note: string };
  magicLink: { subject: string; heading: string; lead: string; cta: string; fallback: string; note: string };
  emailChange: { subject: string; heading: string; lead: string; cta: string; fallback: string; note: string };
};

export const NATIVE_AUTH_EXTRA_COPY: Record<EmailLocale, NativeAuthExtraCopy> = {
  tr: {
    invite: {
      subject: "İşBul KKTC davetiniz",
      heading: "İşBul KKTC'ye davet edildiniz",
      lead: "{email} adresi için bir İşBul KKTC hesabı daveti oluşturuldu. Daveti kabul edip hesabınızı oluşturmak için düğmeyi kullanın.",
      cta: "Daveti kabul et",
      fallback: "Düğme çalışmazsa bu bağlantıyı tarayıcınıza kopyalayın:",
      note: "Bu daveti beklemiyorsanız yok sayabilirsiniz; bağlantı kısa süre geçerlidir.",
    },
    magicLink: {
      subject: "İşBul KKTC giriş bağlantınız",
      heading: "Giriş bağlantınız",
      lead: "Aşağıdaki bağlantıyla {email} adresine bağlı İşBul KKTC hesabınıza giriş yapabilirsiniz.",
      cta: "Giriş yap",
      fallback: "Düğme çalışmazsa bu bağlantıyı tarayıcınıza kopyalayın:",
      note: "Bağlantı kısa süre geçerlidir ve yalnızca bir kez kullanılabilir.",
    },
    emailChange: {
      subject: "İşBul KKTC yeni e-posta adresinizi doğrulayın",
      heading: "Yeni e-posta adresinizi doğrulayın",
      lead: "Hesabınızın e-posta adresini {email} olarak doğrulamak için düğmeyi kullanın.",
      cta: "Yeni adresi doğrula",
      fallback: "Düğme çalışmazsa bu bağlantıyı tarayıcınıza kopyalayın:",
      note: "Bu değişikliği siz yapmadıysanız bu e-postayı yok sayın ve hesap güvenliğiniz için şifrenizi yenileyin.",
    },
  },
  en: {
    invite: {
      subject: "İşBul KKTC — You have been invited to İşBul KKTC",
      heading: "You have been invited to İşBul KKTC",
      lead: "An İşBul KKTC account invitation was created for {email}. Use the button to accept it and set up your account.",
      cta: "Accept the invitation",
      fallback: "If the button does not work, copy this link into your browser:",
      note: "If you were not expecting this invitation you can ignore it; the link expires shortly.",
    },
    magicLink: {
      subject: "İşBul KKTC — Your sign-in link",
      heading: "Your sign-in link",
      lead: "Use the link below to sign in to the İşBul KKTC account linked to {email}.",
      cta: "Sign in",
      fallback: "If the button does not work, copy this link into your browser:",
      note: "The link expires shortly and can be used only once.",
    },
    emailChange: {
      subject: "İşBul KKTC — Confirm your new email address",
      heading: "Confirm your new email address",
      lead: "Use the button to confirm {email} as the email address for your account.",
      cta: "Confirm the new address",
      fallback: "If the button does not work, copy this link into your browser:",
      note: "If you did not request this change, ignore this email and reset your password for account security.",
    },
  },
  ru: {
    invite: {
      subject: "İşBul KKTC — Вас пригласили в İşBul KKTC",
      heading: "Вас пригласили в İşBul KKTC",
      lead: "Для {email} создано приглашение в İşBul KKTC. Нажмите кнопку, чтобы принять его и создать аккаунт.",
      cta: "Принять приглашение",
      fallback: "Если кнопка не работает, скопируйте эту ссылку в браузер:",
      note: "Если вы не ожидали это приглашение, проигнорируйте его; ссылка скоро истечёт.",
    },
    magicLink: {
      subject: "İşBul KKTC — Ваша ссылка для входа",
      heading: "Ваша ссылка для входа",
      lead: "По ссылке ниже вы войдёте в аккаунт İşBul KKTC, привязанный к {email}.",
      cta: "Войти",
      fallback: "Если кнопка не работает, скопируйте эту ссылку в браузер:",
      note: "Ссылка действует недолго и может быть использована только один раз.",
    },
    emailChange: {
      subject: "İşBul KKTC — Подтвердите новый адрес электронной почты",
      heading: "Подтвердите новый адрес электронной почты",
      lead: "Нажмите кнопку, чтобы подтвердить {email} как адрес электронной почты вашего аккаунта.",
      cta: "Подтвердить новый адрес",
      fallback: "Если кнопка не работает, скопируйте эту ссылку в браузер:",
      note: "Если вы не запрашивали это изменение, проигнорируйте письмо и смените пароль для безопасности аккаунта.",
    },
  },
  el: {
    invite: {
      subject: "İşBul KKTC — Σας προσκάλεσαν στο İşBul KKTC",
      heading: "Σας προσκάλεσαν στο İşBul KKTC",
      lead: "Δημιουργήθηκε πρόσκληση λογαριασμού İşBul KKTC για το {email}. Πατήστε το κουμπί για αποδοχή και δημιουργία λογαριασμού.",
      cta: "Αποδοχή πρόσκλησης",
      fallback: "Αν το κουμπί δεν λειτουργεί, αντιγράψτε αυτόν τον σύνδεσμο στον περιηγητή σας:",
      note: "Αν δεν περιμένατε αυτή την πρόσκληση, μπορείτε να την αγνοήσετε· ο σύνδεσμος λήγει σύντομα.",
    },
    magicLink: {
      subject: "İşBul KKTC — Ο σύνδεσμος σύνδεσής σας",
      heading: "Ο σύνδεσμος σύνδεσής σας",
      lead: "Χρησιμοποιήστε τον παρακάτω σύνδεσμο για να συνδεθείτε στον λογαριασμό İşBul KKTC που συνδέεται με το {email}.",
      cta: "Σύνδεση",
      fallback: "Αν το κουμπί δεν λειτουργεί, αντιγράψτε αυτόν τον σύνδεσμο στον περιηγητή σας:",
      note: "Ο σύνδεσμος λήγει σύντομα και μπορεί να χρησιμοποιηθεί μόνο μία φορά.",
    },
    emailChange: {
      subject: "İşBul KKTC — Επιβεβαιώστε τη νέα διεύθυνση email σας",
      heading: "Επιβεβαιώστε τη νέα διεύθυνση email σας",
      lead: "Πατήστε το κουμπί για να επιβεβαιώσετε το {email} ως διεύθυνση email του λογαριασμού σας.",
      cta: "Επιβεβαίωση νέας διεύθυνσης",
      fallback: "Αν το κουμπί δεν λειτουργεί, αντιγράψτε αυτόν τον σύνδεσμο στον περιηγητή σας:",
      note: "Αν δεν ζητήσατε αυτή την αλλαγή, αγνοήστε το email και επαναφέρετε τον κωδικό σας για την ασφάλεια του λογαριασμού.",
    },
  },
  fa: {
    invite: {
      subject: "İşBul KKTC — دعوت‌نامه شما",
      heading: "به İşBul KKTC دعوت شده‌اید",
      lead: "دعوت‌نامه ساخت حساب İşBul KKTC برای {email} ایجاد شده است. برای پذیرش دعوت و ساخت حساب، دکمه را بزنید.",
      cta: "پذیرش دعوت‌نامه",
      fallback: "اگر دکمه کار نکرد، این پیوند را در مرورگر خود کپی کنید:",
      note: "اگر انتظار این دعوت‌نامه را نداشتید، آن را نادیده بگیرید؛ پیوند به‌زودی منقضی می‌شود.",
    },
    magicLink: {
      subject: "İşBul KKTC — پیوند ورود شما",
      heading: "پیوند ورود شما",
      lead: "با پیوند زیر به حساب İşBul KKTC مرتبط با {email} وارد شوید.",
      cta: "ورود",
      fallback: "اگر دکمه کار نکرد، این پیوند را در مرورگر خود کپی کنید:",
      note: "این پیوند به‌زودی منقضی می‌شود و فقط یک بار قابل استفاده است.",
    },
    emailChange: {
      subject: "İşBul KKTC — نشانی ایمیل جدید خود را تأیید کنید",
      heading: "نشانی ایمیل جدید خود را تأیید کنید",
      lead: "برای تأیید {email} به‌عنوان نشانی ایمیل حساب خود، دکمه را بزنید.",
      cta: "تأیید نشانی جدید",
      fallback: "اگر دکمه کار نکرد، این پیوند را در مرورگر خود کپی کنید:",
      note: "اگر این تغییر را درخواست نکرده‌اید، این ایمیل را نادیده بگیرید و برای امنیت حساب گذرواژه خود را بازنشانی کنید.",
    },
  },
  de: {
    invite: {
      subject: "İşBul KKTC — Sie wurden zu İşBul KKTC eingeladen",
      heading: "Sie wurden zu İşBul KKTC eingeladen",
      lead: "Für {email} wurde eine Einladung zum İşBul KKTC-Konto erstellt. Klicken Sie auf die Schaltfläche, um sie anzunehmen und Ihr Konto einzurichten.",
      cta: "Einladung annehmen",
      fallback: "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
      note: "Wenn Sie diese Einladung nicht erwartet haben, können Sie sie ignorieren; der Link läuft bald ab.",
    },
    magicLink: {
      subject: "İşBul KKTC — Ihr Anmeldelink",
      heading: "Ihr Anmeldelink",
      lead: "Melden Sie sich über den Link unten beim İşBul KKTC-Konto von {email} an.",
      cta: "Anmelden",
      fallback: "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
      note: "Der Link läuft bald ab und kann nur einmal verwendet werden.",
    },
    emailChange: {
      subject: "İşBul KKTC — Bestätigen Sie Ihre neue E-Mail-Adresse",
      heading: "Bestätigen Sie Ihre neue E-Mail-Adresse",
      lead: "Bestätigen Sie mit der Schaltfläche {email} als E-Mail-Adresse Ihres Kontos.",
      cta: "Neue Adresse bestätigen",
      fallback: "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
      note: "Wenn Sie diese Änderung nicht angefordert haben, ignorieren Sie diese E-Mail und setzen Sie Ihr Passwort zur Kontosicherheit zurück.",
    },
  },
};

export function getNativeAuthExtraCopy(locale: string | null | undefined): NativeAuthExtraCopy {
  return NATIVE_AUTH_EXTRA_COPY[resolveEmailLocale(locale)];
}
