type Locale = "tr" | "en" | "ru" | "el" | "fa" | "de";
type EventType = "submitted" | "viewed" | "status_changed";

type OutboxItem = {
  outbox_id: string;
  notification_id: string;
  recipient_user_id: string;
  recipient_email: string;
  recipient_locale: string;
  recipient_is_candidate: boolean;
  event_type: EventType;
  job_title: string;
  application_status: string;
  application_id: string;
};

const messages: Record<
  Locale,
  {
    candidateAppliedSubject: string;
    candidateApplied: string;
    employerAppliedSubject: string;
    employerApplied: string;
    viewedSubject: string;
    viewed: string;
    statusSubject: string;
    statusChanged: string;
    statuses: Record<string, string>;
    openDashboard: string;
  }
> = {
  tr: {
    candidateAppliedSubject: "Başvurunuz işverene iletildi",
    candidateApplied: "Başvurunuz kaydedildi ve işverenin hesabına iletildi.",
    employerAppliedSubject: "Yeni iş ilanı başvurusu",
    employerApplied: "Şirket ilanınıza yeni bir aday başvurdu.",
    viewedSubject: "İşveren başvurunuzu görüntüledi",
    viewed: "İşveren başvurunuzu ilk kez görüntüledi.",
    statusSubject: "Başvuru durumunuz güncellendi",
    statusChanged: "Başvurunuzun yeni durumu: {status}.",
    statuses: {
      submitted: "İşverene iletildi",
      reviewing: "İnceleniyor",
      shortlisted: "Ön değerlendirmeyi geçti",
      rejected: "Olumsuz sonuçlandı",
      hired: "İşe alım tamamlandı",
      withdrawn: "Geri çekildi",
    },
    openDashboard: "Hesabınızdan başvuruyu takip edebilirsiniz:",
  },
  en: {
    candidateAppliedSubject: "Your application was sent",
    candidateApplied: "Your application was saved and sent to the employer's account.",
    employerAppliedSubject: "New job application",
    employerApplied: "A candidate applied to your company's job listing.",
    viewedSubject: "The employer viewed your application",
    viewed: "The employer viewed your application for the first time.",
    statusSubject: "Your application status changed",
    statusChanged: "Your new application status: {status}.",
    statuses: {
      submitted: "Sent to employer",
      reviewing: "Under review",
      shortlisted: "Shortlisted",
      rejected: "Not selected",
      hired: "Hired",
      withdrawn: "Withdrawn",
    },
    openDashboard: "Track this application from your account:",
  },
  ru: {
    candidateAppliedSubject: "Отклик передан работодателю",
    candidateApplied: "Отклик сохранён и передан в кабинет работодателя.",
    employerAppliedSubject: "Новый отклик на вакансию",
    employerApplied: "Кандидат откликнулся на вакансию вашей компании.",
    viewedSubject: "Работодатель просмотрел ваш отклик",
    viewed: "Работодатель впервые просмотрел ваш отклик.",
    statusSubject: "Статус отклика изменён",
    statusChanged: "Новый статус отклика: {status}.",
    statuses: {
      submitted: "Передан работодателю",
      reviewing: "На рассмотрении",
      shortlisted: "В коротком списке",
      rejected: "Не выбрано",
      hired: "Принят на работу",
      withdrawn: "Отозван",
    },
    openDashboard: "Отслеживайте отклик в аккаунте:",
  },
  el: {
    candidateAppliedSubject: "Η αίτησή σας παραδόθηκε",
    candidateApplied: "Η αίτησή σας αποθηκεύτηκε και παραδόθηκε στον λογαριασμό του εργοδότη.",
    employerAppliedSubject: "Νέα αίτηση εργασίας",
    employerApplied: "Ένας υποψήφιος υπέβαλε αίτηση για αγγελία της εταιρείας σας.",
    viewedSubject: "Ο εργοδότης είδε την αίτησή σας",
    viewed: "Ο εργοδότης είδε την αίτησή σας για πρώτη φορά.",
    statusSubject: "Η κατάσταση της αίτησής σας άλλαξε",
    statusChanged: "Νέα κατάσταση αίτησης: {status}.",
    statuses: {
      submitted: "Παραδόθηκε στον εργοδότη",
      reviewing: "Υπό εξέταση",
      shortlisted: "Στη βραχεία λίστα",
      rejected: "Δεν επιλέχθηκε",
      hired: "Προσλήφθηκε",
      withdrawn: "Αποσύρθηκε",
    },
    openDashboard: "Παρακολουθήστε την αίτηση από τον λογαριασμό σας:",
  },
  fa: {
    candidateAppliedSubject: "درخواست شما به کارفرما تحویل شد",
    candidateApplied: "درخواست شما ثبت و به حساب کارفرما ارسال شد.",
    employerAppliedSubject: "درخواست شغلی جدید",
    employerApplied: "یک نامزد برای آگهی شرکت شما درخواست داده است.",
    viewedSubject: "کارفرما درخواست شما را مشاهده کرد",
    viewed: "کارفرما برای نخستین بار درخواست شما را مشاهده کرد.",
    statusSubject: "وضعیت درخواست شما تغییر کرد",
    statusChanged: "وضعیت جدید درخواست: {status}.",
    statuses: {
      submitted: "به کارفرما ارسال شد",
      reviewing: "در حال بررسی",
      shortlisted: "در فهرست نهایی",
      rejected: "انتخاب نشد",
      hired: "استخدام شد",
      withdrawn: "پس گرفته شد",
    },
    openDashboard: "وضعیت درخواست را در حساب خود پیگیری کنید:",
  },
  de: {
    candidateAppliedSubject: "Ihre Bewerbung wurde übermittelt",
    candidateApplied: "Ihre Bewerbung wurde gespeichert und an das Arbeitgeberkonto übermittelt.",
    employerAppliedSubject: "Neue Bewerbung",
    employerApplied: "Ein Kandidat hat sich auf eine Stelle Ihres Unternehmens beworben.",
    viewedSubject: "Der Arbeitgeber hat Ihre Bewerbung angesehen",
    viewed: "Der Arbeitgeber hat Ihre Bewerbung erstmals angesehen.",
    statusSubject: "Ihr Bewerbungsstatus hat sich geändert",
    statusChanged: "Ihr neuer Bewerbungsstatus: {status}.",
    statuses: {
      submitted: "An Arbeitgeber übermittelt",
      reviewing: "Wird geprüft",
      shortlisted: "In der engeren Auswahl",
      rejected: "Nicht ausgewählt",
      hired: "Eingestellt",
      withdrawn: "Zurückgezogen",
    },
    openDashboard: "Verfolgen Sie die Bewerbung in Ihrem Konto:",
  },
};

function response(status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isAllowedOrigin(url: URL) {
  const localHosts = ["localhost", "127.0.0.1", "kong"];
  return (
    url.pathname === "/" &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" && localHosts.includes(url.hostname)))
  );
}

async function rpc<T>(
  supabaseUrl: string,
  serviceKey: string,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const result = await fetch(new URL(`/rest/v1/rpc/${name}`, supabaseUrl), {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!result.ok) {
    throw new Error(`supabase_rpc_${name}_${result.status}`);
  }
  return (await result.json()) as T;
}

function getEmailContent(item: OutboxItem, appUrl: URL) {
  const locale = (item.recipient_locale in messages
    ? item.recipient_locale
    : "tr") as Locale;
  const copy = messages[locale];
  const dashboardPath = item.recipient_is_candidate
    ? "/profile/dashboard#my-applications"
    : `/company/dashboard/applications/${item.application_id}`;
  const localePrefix = locale === "tr" ? "" : `/${locale}`;
  const dashboardUrl = new URL(`${localePrefix}${dashboardPath}`, appUrl).toString();
  const status = copy.statuses[item.application_status];

  if (item.event_type === "viewed" && item.recipient_is_candidate) {
    return {
      subject: copy.viewedSubject,
      text: `${copy.viewed}\n\n${item.job_title}\n${copy.openDashboard}\n${dashboardUrl}`,
    };
  }

  if (item.event_type === "status_changed" && status) {
    return {
      subject: copy.statusSubject,
      text: `${copy.statusChanged.replace("{status}", status)}\n\n${item.job_title}\n${copy.openDashboard}\n${dashboardUrl}`,
    };
  }

  if (item.event_type === "submitted" && item.recipient_is_candidate) {
    return {
      subject: copy.candidateAppliedSubject,
      text: `${copy.candidateApplied}\n\n${item.job_title}\n${copy.openDashboard}\n${dashboardUrl}`,
    };
  }

  if (item.event_type === "submitted") {
    return {
      subject: copy.employerAppliedSubject,
      text: `${copy.employerApplied}\n\n${item.job_title}\n${copy.openDashboard}\n${dashboardUrl}`,
    };
  }

  throw new Error("unsupported_notification_event");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return response(405, "Method not allowed");
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrlValue = Deno.env.get("SUPABASE_URL");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("RESEND_FROM_EMAIL");
  const appUrlValue = Deno.env.get("APP_URL");
  if (!serviceKey || !supabaseUrlValue || !resendApiKey || !emailFrom || !appUrlValue) {
    return response(503, "Notification delivery is not configured");
  }

  if (request.headers.get("authorization") !== `Bearer ${serviceKey}`) {
    return response(401, "Unauthorized");
  }

  let supabaseUrl: URL;
  let appUrl: URL;
  try {
    supabaseUrl = new URL(supabaseUrlValue);
    appUrl = new URL(appUrlValue);
  } catch {
    return response(503, "Notification delivery configuration is invalid");
  }
  if (!isAllowedOrigin(supabaseUrl) || !isAllowedOrigin(appUrl) || !emailFrom.includes("@")) {
    return response(503, "Notification delivery configuration is invalid");
  }

  let batchSize = 20;
  try {
    const input = await request.json();
    if (
      typeof input === "object" &&
      input !== null &&
      "_batch_size" in input
    ) {
      const requestedSize = input._batch_size;
      if (
        typeof requestedSize !== "number" ||
        !Number.isInteger(requestedSize) ||
        requestedSize < 1 ||
        requestedSize > 100
      ) {
        return response(400, "Invalid batch size");
      }
      batchSize = requestedSize;
    }
  } catch {
    return response(400, "Invalid request body");
  }

  let items: OutboxItem[];
  try {
    items = await rpc<OutboxItem[]>(supabaseUrl.toString(), serviceKey, "claim_notification_email_outbox", {
      _batch_size: batchSize,
    });
  } catch (error) {
    console.error("Notification outbox claim failed.", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return response(502, "Notification queue is temporarily unavailable");
  }

  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const email = getEmailContent(item, appUrl);
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `application-notification/${item.notification_id}`,
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [item.recipient_email],
          subject: email.subject,
          text: email.text,
        }),
      });
      const resendResult = await resendResponse.json();

      if (
        !resendResponse.ok ||
        typeof resendResult !== "object" ||
        resendResult === null ||
        typeof resendResult.id !== "string"
      ) {
        await rpc(supabaseUrl.toString(), serviceKey, "finish_notification_email", {
          _outbox_id: item.outbox_id,
          _provider_message_id: null,
          _error_code: `resend_http_${resendResponse.status}`,
        });
        failed += 1;
        continue;
      }

      await rpc(supabaseUrl.toString(), serviceKey, "finish_notification_email", {
        _outbox_id: item.outbox_id,
        _provider_message_id: resendResult.id,
        _error_code: null,
      });
      sent += 1;
    } catch (error) {
      console.error("Application notification delivery failed.", {
        outboxId: item.outbox_id,
        error: error instanceof Error ? error.message : "unknown_error",
      });
      try {
        await rpc(supabaseUrl.toString(), serviceKey, "finish_notification_email", {
          _outbox_id: item.outbox_id,
          _provider_message_id: null,
          _error_code: "notification_delivery_error",
        });
      } catch (finishError) {
        console.error("Notification retry could not be scheduled.", {
          outboxId: item.outbox_id,
          error:
            finishError instanceof Error
              ? finishError.message
              : "unknown_error",
        });
        return response(502, "A notification could not be scheduled for retry");
      }
      failed += 1;
    }
  }

  return Response.json({ claimed: items.length, sent, failed });
});
