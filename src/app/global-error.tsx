"use client";

import { useSyncExternalStore } from "react";

const globalErrorCopy = {
  tr: {
    title: "Bir hata oluştu",
    body: "Beklenmeyen bir sistem hatası meydana geldi.",
    retry: "Yeniden dene",
  },
  en: {
    title: "Something went wrong",
    body: "An unexpected system error occurred.",
    retry: "Try again",
  },
  ru: {
    title: "Произошла ошибка",
    body: "Возникла непредвиденная системная ошибка.",
    retry: "Повторить",
  },
  el: {
    title: "Κάτι πήγε στραβά",
    body: "Παρουσιάστηκε ένα μη αναμενόμενο σφάλμα συστήματος.",
    retry: "Δοκιμάστε ξανά",
  },
  fa: {
    title: "خطایی رخ داد",
    body: "یک خطای غیرمنتظره در سیستم رخ داد.",
    retry: "تلاش دوباره",
  },
  de: {
    title: "Ein Fehler ist aufgetreten",
    body: "Ein unerwarteter Systemfehler ist aufgetreten.",
    retry: "Erneut versuchen",
  },
} as const;

type GlobalErrorLocale = keyof typeof globalErrorCopy;

function isGlobalErrorLocale(locale: string): locale is GlobalErrorLocale {
  return Object.hasOwn(globalErrorCopy, locale);
}

function getBrowserLocale(): GlobalErrorLocale {
  const languages =
    typeof navigator === "undefined"
      ? []
      : [...navigator.languages, navigator.language];

  for (const language of languages) {
    const locale = language.split("-")[0];
    if (locale && isGlobalErrorLocale(locale)) {
      return locale;
    }
  }

  return "tr";
}

function subscribeToLanguageChanges(onChange: () => void) {
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
}

function getServerLocale(): GlobalErrorLocale {
  return "tr";
}

export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const locale = useSyncExternalStore(
    subscribeToLanguageChanges,
    getBrowserLocale,
    getServerLocale,
  );
  const copy = globalErrorCopy[locale];

  return (
    <html lang={locale} dir={locale === "fa" ? "rtl" : "ltr"}>
      <body style={{ margin: 0, padding: "2rem", fontFamily: "system-ui, sans-serif", background: "#07130f", color: "#fffdf8", textAlign: "center" }}>
        <h2>{copy.title}</h2>
        <p style={{ opacity: 0.7 }}>{copy.body}</p>
        <button
          onClick={() => retry()}
          style={{ marginTop: "1rem", padding: "0.6rem 1.2rem", borderRadius: "8px", border: "1px solid #4b8066", background: "#10211a", color: "#fffdf8", cursor: "pointer" }}
        >
          {copy.retry}
        </button>
      </body>
    </html>
  );
}
