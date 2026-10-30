/**
 * Locale copy for every transactional email İşBul KKTC sends.
 *
 * Kept free of Deno and Node globals so both the Edge Function worker and the
 * Node-side sender (server actions) can import the same strings, and so it is
 * unit testable with plain `node --test`. Only the `tr` catalog is fully
 * maintained; the other five mirror the app's `localePrefix` set and fall back
 * to `tr` when a key is missing.
 */

export const EMAIL_LOCALES = ["tr", "en", "ru", "el", "fa", "de"] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export function resolveEmailLocale(value: string | null | undefined): EmailLocale {
  return (EMAIL_LOCALES as readonly string[]).includes(value ?? "")
    ? (value as EmailLocale)
    : "tr";
}

export type EmailCopy = {
  /** Shown in the client's inbox preview, before the body is opened. */
  auth: {
    confirmationSubject: string;
    confirmationHeading: string;
    confirmationLead: string;
    confirmationCta: string;
    confirmationFallback: string;
    confirmationIgnore: string;
    recoverySubject: string;
    recoveryHeading: string;
    recoveryLead: string;
    recoveryCta: string;
    recoveryIgnore: string;
    reauthenticationSubject: string;
    reauthenticationHeading: string;
    reauthenticationLead: string;
    reauthenticationIgnore: string;
    passwordChangedSubject: string;
    passwordChangedHeading: string;
    passwordChangedLead: string;
    passwordChangedWarning: string;
  };
  welcome: {
    candidateSubject: string;
    candidateHeading: string;
    candidateLead: string;
    candidateSteps: string[];
    candidateCta: string;
    employerSubject: string;
    employerHeading: string;
    employerLead: string;
    employerSteps: string[];
    employerCta: string;
  };
  notification: {
    candidateAppliedSubject: string;
    candidateApplied: string;
    employerAppliedSubject: string;
    employerApplied: string;
    viewedSubject: string;
    viewed: string;
    statusSubject: string;
    statusChanged: string;
    openDashboard: string;
  };
  statuses: Record<string, string>;
  feedback: {
    receivedSubject: string;
    receivedHeading: string;
    receivedLead: string;
    receivedCta: string;
    teamSubject: string;
    teamHeading: string;
  };
  labels: {
    jobLabel: string;
    categoryLabel: string;
    ratingLabel: string;
    messageLabel: string;
  };
  footer: {
    reason: string;
    legal: string;
    rights: string;
  };
};

const tr: EmailCopy = {
  auth: {
    confirmationSubject: "İşBul KKTC e-posta adresinizi doğrulayın",
    confirmationHeading: "E-posta adresinizi doğrulayın",
    confirmationLead:
      "İşBul KKTC hesabınızı etkinleştirmek için aşağıdaki düğmeyle e-posta adresinizi doğrulayın.",
    confirmationCta: "E-posta adresimi doğrula",
    confirmationFallback:
      "Düğme çalışmazsa bu bağlantıyı tarayıcınıza kopyalayın:",
    confirmationIgnore:
      "Bu e-postayı siz istemediyseniz yok sayabilirsiniz; bağlantı kısa süre geçerlidir.",
    recoverySubject: "İşBul KKTC şifre yenileme bağlantınız",
    recoveryHeading: "Şifrenizi yenileyin",
    recoveryLead:
      "Hesabınız için şifre yenileme talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki düğmeyi kullanın.",
    recoveryCta: "Yeni şifre belirle",
    recoveryIgnore:
      "Bu talebi siz yapmadıysanız hiçbir işlem gerekmez; şifreniz değişmez.",
    reauthenticationSubject: "İşBul KKTC doğrulama kodunuz",
    reauthenticationHeading: "Doğrulama kodunuz",
    reauthenticationLead:
      "Devam etmek için aşağıdaki tek kullanımlık kodu girin. Kodu kimseyle paylaşmayın.",
    reauthenticationIgnore:
      "Bu kodu siz istemediyseniz yok sayabilirsiniz.",
    passwordChangedSubject: "İşBul KKTC şifreniz güncellendi",
    passwordChangedHeading: "Şifreniz güncellendi",
    passwordChangedLead:
      "Hesabınızın şifresi başarıyla değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.",
    passwordChangedWarning:
      "Bu değişikliği siz yapmadıysanız hemen şifrenizi yenileyin ve destek ekibimizle iletişime geçin.",
  },
  welcome: {
    candidateSubject: "İşBul KKTC'ye hoş geldiniz",
    candidateHeading: "Aramıza hoş geldiniz!",
    candidateLead:
      "Kuzey Kıbrıs'ın güvenilir kariyer ağında hesabınız hazır. Profilinizi tamamlayıp doğru işe bir adım daha yaklaşın.",
    candidateSteps: [
      "Profilinizi ve özgeçmişinizi tamamlayın",
      "Doğrulanmış işverenlerin ilanlarını inceleyin",
      "Tek tıkla başvurun ve süreci panelden takip edin",
    ],
    candidateCta: "Profilimi tamamla",
    employerSubject: "İşBul KKTC işveren hesabınız hazır",
    employerHeading: "İşveren hesabınıza hoş geldiniz",
    employerLead:
      "Şirket profilinizi doğrulayıp ilan yayınlayarak Kuzey Kıbrıs'ın en geniş yetenek havuzuna ulaşın.",
    employerSteps: [
      "Şirket profilinizi doğrulatın",
      "İlanınızı oluşturup yayına alın",
      "Başvuruları tek panelden yönetin",
    ],
    employerCta: "Şirket profilimi oluştur",
  },
  notification: {
    candidateAppliedSubject: "Başvurunuz işverene iletildi",
    candidateApplied: "Başvurunuz kaydedildi ve işverenin hesabına iletildi.",
    employerAppliedSubject: "Yeni iş ilanı başvurusu",
    employerApplied: "Şirket ilanınıza yeni bir aday başvurdu.",
    viewedSubject: "İşveren başvurunuzu görüntüledi",
    viewed: "İşveren başvurunuzu ilk kez görüntüledi.",
    statusSubject: "Başvuru durumunuz güncellendi",
    statusChanged: "Başvurunuzun yeni durumu: {status}.",
    openDashboard: "Hesabınızdan başvuruyu takip edebilirsiniz",
  },
  statuses: {
    submitted: "İşverene iletildi",
    reviewing: "İnceleniyor",
    shortlisted: "Ön değerlendirmeyi geçti",
    rejected: "Olumsuz sonuçlandı",
    hired: "İşe alım tamamlandı",
    withdrawn: "Geri çekildi",
  },
  feedback: {
    receivedSubject: "Geri bildiriminiz için teşekkürler",
    receivedHeading: "Geri bildiriminiz bize ulaştı",
    receivedLead:
      "İşBul KKTC'yi daha iyi hale getirmemize yardımcı olduğunuz için teşekkür ederiz. Mesajınızı ekibimiz inceleyecek.",
    receivedCta: "İlanlara göz atın",
    teamSubject: "Yeni geri bildirim",
    teamHeading: "Yeni geri bildirim alındı",
  },
  labels: {
    jobLabel: "İlan",
    categoryLabel: "Konu",
    ratingLabel: "Değerlendirme",
    messageLabel: "Mesaj",
  },
  footer: {
    reason:
      "Bu e-postayı İşBul KKTC hesabınızdaki bir işlem nedeniyle aldınız.",
    legal:
      "Bu e-posta İşBul KKTC platformu üzerinden güvenli bir şekilde gönderilmiştir.",
    rights: "Tüm hakları saklıdır.",
  },
};

const en: EmailCopy = {
  auth: {
    confirmationSubject: "Confirm your İşBul KKTC email address",
    confirmationHeading: "Confirm your email address",
    confirmationLead:
      "Use the button below to confirm your email address and activate your İşBul KKTC account.",
    confirmationCta: "Confirm my email address",
    confirmationFallback:
      "If the button does not work, copy this link into your browser:",
    confirmationIgnore:
      "If you did not request this email you can ignore it; the link expires shortly.",
    recoverySubject: "Your İşBul KKTC password reset link",
    recoveryHeading: "Reset your password",
    recoveryLead:
      "We received a request to reset the password for your account. Use the button below to choose a new password.",
    recoveryCta: "Set a new password",
    recoveryIgnore:
      "If you did not request this, no action is needed; your password stays unchanged.",
    reauthenticationSubject: "Your İşBul KKTC verification code",
    reauthenticationHeading: "Your verification code",
    reauthenticationLead:
      "Enter the one-time code below to continue. Never share this code with anyone.",
    reauthenticationIgnore:
      "If you did not request this code you can ignore it.",
    passwordChangedSubject: "Your İşBul KKTC password was updated",
    passwordChangedHeading: "Your password was updated",
    passwordChangedLead:
      "Your account password was changed successfully. You can now sign in with your new password.",
    passwordChangedWarning:
      "If you did not make this change, reset your password immediately and contact our support team.",
  },
  welcome: {
    candidateSubject: "Welcome to İşBul KKTC",
    candidateHeading: "Welcome aboard!",
    candidateLead:
      "Your account on Northern Cyprus' trusted career network is ready. Complete your profile and get one step closer to the right job.",
    candidateSteps: [
      "Complete your profile and CV",
      "Browse listings from verified employers",
      "Apply in one click and track progress in your dashboard",
    ],
    candidateCta: "Complete my profile",
    employerSubject: "Your İşBul KKTC employer account is ready",
    employerHeading: "Welcome to your employer account",
    employerLead:
      "Verify your company profile and publish a listing to reach Northern Cyprus' largest talent pool.",
    employerSteps: [
      "Get your company profile verified",
      "Create and publish your listing",
      "Manage applications from one dashboard",
    ],
    employerCta: "Create my company profile",
  },
  notification: {
    candidateAppliedSubject: "Your application was sent",
    candidateApplied:
      "Your application was saved and sent to the employer's account.",
    employerAppliedSubject: "New job application",
    employerApplied: "A candidate applied to your company's job listing.",
    viewedSubject: "The employer viewed your application",
    viewed: "The employer viewed your application for the first time.",
    statusSubject: "Your application status changed",
    statusChanged: "Your new application status: {status}.",
    openDashboard: "Track this application from your account",
  },
  statuses: {
    submitted: "Sent to employer",
    reviewing: "Under review",
    shortlisted: "Shortlisted",
    rejected: "Not selected",
    hired: "Hired",
    withdrawn: "Withdrawn",
  },
  feedback: {
    receivedSubject: "Thanks for your feedback",
    receivedHeading: "We received your feedback",
    receivedLead:
      "Thank you for helping us make İşBul KKTC better. Our team will review your message.",
    receivedCta: "Browse listings",
    teamSubject: "New feedback received",
    teamHeading: "New feedback received",
  },
  labels: {
    jobLabel: "Listing",
    categoryLabel: "Topic",
    ratingLabel: "Rating",
    messageLabel: "Message",
  },
  footer: {
    reason: "You received this email because of activity on your İşBul KKTC account.",
    legal: "This email was sent securely through the İşBul KKTC platform.",
    rights: "All rights reserved.",
  },
};

const ru: EmailCopy = {
  auth: {
    confirmationSubject: "Подтвердите адрес электронной почты İşBul KKTC",
    confirmationHeading: "Подтвердите адрес электронной почты",
    confirmationLead:
      "Нажмите кнопку ниже, чтобы подтвердить адрес и активировать аккаунт İşBul KKTC.",
    confirmationCta: "Подтвердить адрес",
    confirmationFallback:
      "Если кнопка не работает, скопируйте ссылку в браузер:",
    confirmationIgnore:
      "Если вы не запрашивали это письмо, просто проигнорируйте его; срок действия ссылки скоро истечёт.",
    recoverySubject: "Ссылка для сброса пароля İşBul KKTC",
    recoveryHeading: "Сбросьте пароль",
    recoveryLead:
      "Мы получили запрос на сброс пароля для вашего аккаунта. Нажмите кнопку ниже, чтобы задать новый пароль.",
    recoveryCta: "Задать новый пароль",
    recoveryIgnore:
      "Если вы этого не запрашивали, ничего делать не нужно; пароль останется прежним.",
    reauthenticationSubject: "Ваш код подтверждения İşBul KKTC",
    reauthenticationHeading: "Ваш код подтверждения",
    reauthenticationLead:
      "Введите одноразовый код ниже, чтобы продолжить. Никому не сообщайте этот код.",
    reauthenticationIgnore:
      "Если вы не запрашивали этот код, просто проигнорируйте его.",
    passwordChangedSubject: "Пароль İşBul KKTC обновлён",
    passwordChangedHeading: "Пароль обновлён",
    passwordChangedLead:
      "Пароль вашего аккаунта успешно изменён. Теперь можно войти с новым паролем.",
    passwordChangedWarning:
      "Если вы этого не делали, немедленно сбросьте пароль и свяжитесь с нашей поддержкой.",
  },
  welcome: {
    candidateSubject: "Добро пожаловать в İşBul KKTC",
    candidateHeading: "Добро пожаловать!",
    candidateLead:
      "Ваш аккаунт в надёжной карьерной сети Северного Кипра готов. Заполните профиль и станьте ближе к подходящей работе.",
    candidateSteps: [
      "Заполните профиль и резюме",
      "Просмотрите вакансии проверенных работодателей",
      "Откликайтесь в один клик и следите за статусом в кабинете",
    ],
    candidateCta: "Заполнить профиль",
    employerSubject: "Ваш аккаунт работодателя İşBul KKTC готов",
    employerHeading: "Добро пожаловать в аккаунт работодателя",
    employerLead:
      "Подтвердите профиль компании и опубликуйте вакансию, чтобы охватить крупнейшую базу талантов Северного Кипра.",
    employerSteps: [
      "Подтвердите профиль компании",
      "Создайте и опубликуйте вакансию",
      "Управляйте откликами из одного кабинета",
    ],
    employerCta: "Создать профиль компании",
  },
  notification: {
    candidateAppliedSubject: "Отклик передан работодателю",
    candidateApplied: "Отклик сохранён и передан в кабинет работодателя.",
    employerAppliedSubject: "Новый отклик на вакансию",
    employerApplied: "Кандидат откликнулся на вакансию вашей компании.",
    viewedSubject: "Работодатель просмотрел ваш отклик",
    viewed: "Работодатель впервые просмотрел ваш отклик.",
    statusSubject: "Статус отклика изменён",
    statusChanged: "Новый статус отклика: {status}.",
    openDashboard: "Отслеживайте отклик в аккаунте",
  },
  statuses: {
    submitted: "Передан работодателю",
    reviewing: "На рассмотрении",
    shortlisted: "В коротком списке",
    rejected: "Не выбрано",
    hired: "Принят на работу",
    withdrawn: "Отозван",
  },
  feedback: {
    receivedSubject: "Спасибо за ваш отзыв",
    receivedHeading: "Мы получили ваш отзыв",
    receivedLead:
      "Спасибо, что помогаете делать İşBul KKTC лучше. Наша команда рассмотрит ваше сообщение.",
    receivedCta: "Смотреть вакансии",
    teamSubject: "Получен новый отзыв",
    teamHeading: "Получен новый отзыв",
  },
  labels: {
    jobLabel: "Вакансия",
    categoryLabel: "Тема",
    ratingLabel: "Оценка",
    messageLabel: "Сообщение",
  },
  footer: {
    reason:
      "Вы получили это письмо из-за действия в вашем аккаунте İşBul KKTC.",
    legal: "Это письмо отправлено безопасно через платформу İşBul KKTC.",
    rights: "Все права защищены.",
  },
};

const el: EmailCopy = {
  auth: {
    confirmationSubject: "Επιβεβαιώστε τη διεύθυνση email σας στο İşBul KKTC",
    confirmationHeading: "Επιβεβαιώστε τη διεύθυνση email σας",
    confirmationLead:
      "Χρησιμοποιήστε το παρακάτω κουμπί για να επιβεβαιώσετε τη διεύθυνση email και να ενεργοποιήσετε τον λογαριασμό σας İşBul KKTC.",
    confirmationCta: "Επιβεβαίωση διεύθυνσης",
    confirmationFallback:
      "Αν το κουμπί δεν λειτουργεί, αντιγράψτε τον σύνδεσμο στον περιηγητή σας:",
    confirmationIgnore:
      "Αν δεν ζητήσατε αυτό το email, μπορείτε να το αγνοήσετε· ο σύνδεσμος λήγει σύντομα.",
    recoverySubject: "Ο σύνδεσμος επαναφοράς κωδικού İşBul KKTC",
    recoveryHeading: "Επαναφέρετε τον κωδικό σας",
    recoveryLead:
      "Λάβαμε αίτημα επαναφοράς κωδικού για τον λογαριασμό σας. Χρησιμοποιήστε το παρακάτω κουμπί για νέο κωδικό.",
    recoveryCta: "Ορισμός νέου κωδικού",
    recoveryIgnore:
      "Αν δεν το ζητήσατε, δεν απαιτείται καμία ενέργεια· ο κωδικός σας παραμένει ίδιος.",
    reauthenticationSubject: "Ο κωδικός επαλήθευσης İşBul KKTC",
    reauthenticationHeading: "Ο κωδικός επαλήθευσής σας",
    reauthenticationLead:
      "Εισαγάγετε τον κωδικό μίας χρήσης παρακάτω για να συνεχίσετε. Μην τον κοινοποιήσετε σε κανέναν.",
    reauthenticationIgnore:
      "Αν δεν ζητήσατε αυτόν τον κωδικό, μπορείτε να τον αγνοήσετε.",
    passwordChangedSubject: "Ο κωδικός σας στο İşBul KKTC ενημερώθηκε",
    passwordChangedHeading: "Ο κωδικός σας ενημερώθηκε",
    passwordChangedLead:
      "Ο κωδικός του λογαριασμού σας άλλαξε με επιτυχία. Μπορείτε πλέον να συνδεθείτε με τον νέο κωδικό.",
    passwordChangedWarning:
      "Αν δεν κάνατε αυτή την αλλαγή, επαναφέρετε αμέσως τον κωδικό και επικοινωνήστε με την υποστήριξη.",
  },
  welcome: {
    candidateSubject: "Καλώς ήρθατε στο İşBul KKTC",
    candidateHeading: "Καλώς ήρθατε!",
    candidateLead:
      "Ο λογαριασμός σας στο αξιόπιστο δίκτυο καριέρας της Βόρειας Κύπρου είναι έτοιμος. Συμπληρώστε το προφίλ σας και πλησιάστε στη σωστή θέση.",
    candidateSteps: [
      "Συμπληρώστε το προφίλ και το βιογραφικό σας",
      "Δείτε αγγελίες από επαληθευμένους εργοδότες",
      "Κάντε αίτηση με ένα κλικ και παρακολουθήστε την πορεία",
    ],
    candidateCta: "Συμπλήρωση προφίλ",
    employerSubject: "Ο λογαριασμός εργοδότη σας στο İşBul KKTC είναι έτοιμος",
    employerHeading: "Καλώς ήρθατε στον λογαριασμό εργοδότη",
    employerLead:
      "Επαληθεύστε το προφίλ της εταιρείας και δημοσιεύστε αγγελία για να φτάσετε στο μεγαλύτερο ταλέντο της Βόρειας Κύπρου.",
    employerSteps: [
      "Επαληθεύστε το προφίλ της εταιρείας",
      "Δημιουργήστε και δημοσιεύστε την αγγελία σας",
      "Διαχειριστείτε τις αιτήσεις από ένα ταμπλό",
    ],
    employerCta: "Δημιουργία προφίλ εταιρείας",
  },
  notification: {
    candidateAppliedSubject: "Η αίτησή σας παραδόθηκε",
    candidateApplied:
      "Η αίτησή σας αποθηκεύτηκε και παραδόθηκε στον λογαριασμό του εργοδότη.",
    employerAppliedSubject: "Νέα αίτηση εργασίας",
    employerApplied:
      "Ένας υποψήφιος υπέβαλε αίτηση για αγγελία της εταιρείας σας.",
    viewedSubject: "Ο εργοδότης είδε την αίτησή σας",
    viewed: "Ο εργοδότης είδε την αίτησή σας για πρώτη φορά.",
    statusSubject: "Η κατάσταση της αίτησής σας άλλαξε",
    statusChanged: "Νέα κατάσταση αίτησης: {status}.",
    openDashboard: "Παρακολουθήστε την αίτηση από τον λογαριασμό σας",
  },
  statuses: {
    submitted: "Παραδόθηκε στον εργοδότη",
    reviewing: "Υπό εξέταση",
    shortlisted: "Στη βραχεία λίστα",
    rejected: "Δεν επιλέχθηκε",
    hired: "Προσλήφθηκε",
    withdrawn: "Αποσύρθηκε",
  },
  feedback: {
    receivedSubject: "Ευχαριστούμε για τα σχόλιά σας",
    receivedHeading: "Λάβαμε τα σχόλιά σας",
    receivedLead:
      "Ευχαριστούμε που μας βοηθάτε να κάνουμε το İşBul KKTC καλύτερο. Η ομάδα μας θα εξετάσει το μήνυμά σας.",
    receivedCta: "Δείτε αγγελίες",
    teamSubject: "Νέα σχόλια",
    teamHeading: "Λήφθηκαν νέα σχόλια",
  },
  labels: {
    jobLabel: "Αγγελία",
    categoryLabel: "Θέμα",
    ratingLabel: "Αξιολόγηση",
    messageLabel: "Μήνυμα",
  },
  footer: {
    reason:
      "Λάβατε αυτό το email λόγω δραστηριότητας στον λογαριασμό σας İşBul KKTC.",
    legal: "Αυτό το email στάλθηκε με ασφάλεια μέσω της πλατφόρμας İşBul KKTC.",
    rights: "Με επιφύλαξη παντός δικαιώματος.",
  },
};

const fa: EmailCopy = {
  auth: {
    confirmationSubject: "نشانی ایمیل خود را در İşBul KKTC تأیید کنید",
    confirmationHeading: "نشانی ایمیل خود را تأیید کنید",
    confirmationLead:
      "برای تأیید نشانی ایمیل و فعال‌سازی حساب İşBul KKTC از دکمه زیر استفاده کنید.",
    confirmationCta: "تأیید نشانی ایمیل",
    confirmationFallback:
      "اگر دکمه کار نمی‌کند، این پیوند را در مرورگر خود کپی کنید:",
    confirmationIgnore:
      "اگر این ایمیل را درخواست نکرده‌اید، می‌توانید آن را نادیده بگیرید؛ پیوند به‌زودی منقضی می‌شود.",
    recoverySubject: "پیوند بازنشانی رمز İşBul KKTC",
    recoveryHeading: "رمز خود را بازنشانی کنید",
    recoveryLead:
      "درخواست بازنشانی رمز برای حساب شما دریافت شد. برای تعیین رمز جدید از دکمه زیر استفاده کنید.",
    recoveryCta: "تعیین رمز جدید",
    recoveryIgnore:
      "اگر این درخواست را شما نداده‌اید، نیازی به اقدام نیست؛ رمز شما تغییر نمی‌کند.",
    reauthenticationSubject: "کد تأیید İşBul KKTC",
    reauthenticationHeading: "کد تأیید شما",
    reauthenticationLead:
      "برای ادامه کد یک‌بارمصرف زیر را وارد کنید. این کد را با کسی به اشتراک نگذارید.",
    reauthenticationIgnore:
      "اگر این کد را درخواست نکرده‌اید، می‌توانید آن را نادیده بگیرید.",
    passwordChangedSubject: "رمز İşBul KKTC شما به‌روزرسانی شد",
    passwordChangedHeading: "رمز شما به‌روزرسانی شد",
    passwordChangedLead:
      "رمز حساب شما با موفقیت تغییر کرد. اکنون می‌توانید با رمز جدید وارد شوید.",
    passwordChangedWarning:
      "اگر این تغییر را شما انجام نداده‌اید، فوراً رمز را بازنشانی کنید و با پشتیبانی ما تماس بگیرید.",
  },
  welcome: {
    candidateSubject: "به İşBul KKTC خوش آمدید",
    candidateHeading: "خوش آمدید!",
    candidateLead:
      "حساب شما در شبکه معتبر کاریابی قبرس شمالی آماده است. نمایه خود را کامل کنید و به شغل مناسب نزدیک‌تر شوید.",
    candidateSteps: [
      "نمایه و رزومه خود را کامل کنید",
      "آگهی‌های کارفرمایان تأییدشده را مرور کنید",
      "با یک کلیک درخواست دهید و روند را پیگیری کنید",
    ],
    candidateCta: "تکمیل نمایه من",
    employerSubject: "حساب کارفرمای شما در İşBul KKTC آماده است",
    employerHeading: "به حساب کارفرما خوش آمدید",
    employerLead:
      "نمایه شرکت خود را تأیید و آگهی منتشر کنید تا به بزرگ‌ترین استعداد قبرس شمالی دسترسی یابید.",
    employerSteps: [
      "نمایه شرکت خود را تأیید کنید",
      "آگهی خود را ایجاد و منتشر کنید",
      "درخواست‌ها را از یک پنل مدیریت کنید",
    ],
    employerCta: "ایجاد نمایه شرکت",
  },
  notification: {
    candidateAppliedSubject: "درخواست شما به کارفرما تحویل شد",
    candidateApplied: "درخواست شما ثبت و به حساب کارفرما ارسال شد.",
    employerAppliedSubject: "درخواست شغلی جدید",
    employerApplied: "یک نامزد برای آگهی شرکت شما درخواست داده است.",
    viewedSubject: "کارفرما درخواست شما را مشاهده کرد",
    viewed: "کارفرما برای نخستین بار درخواست شما را مشاهده کرد.",
    statusSubject: "وضعیت درخواست شما تغییر کرد",
    statusChanged: "وضعیت جدید درخواست: {status}.",
    openDashboard: "وضعیت درخواست را در حساب خود پیگیری کنید",
  },
  statuses: {
    submitted: "به کارفرما ارسال شد",
    reviewing: "در حال بررسی",
    shortlisted: "در فهرست نهایی",
    rejected: "انتخاب نشد",
    hired: "استخدام شد",
    withdrawn: "پس گرفته شد",
  },
  feedback: {
    receivedSubject: "از بازخورد شما سپاسگزاریم",
    receivedHeading: "بازخورد شما به ما رسید",
    receivedLead:
      "سپاسگزاریم که به بهتر شدن İşBul KKTC کمک می‌کنید. تیم ما پیام شما را بررسی می‌کند.",
    receivedCta: "مشاهده آگهی‌ها",
    teamSubject: "بازخورد جدید دریافت شد",
    teamHeading: "بازخورد جدید دریافت شد",
  },
  labels: {
    jobLabel: "آگهی",
    categoryLabel: "موضوع",
    ratingLabel: "امتیاز",
    messageLabel: "پیام",
  },
  footer: {
    reason:
      "این ایمیل به دلیل فعالیتی در حساب İşBul KKTC شما ارسال شد.",
    legal: "این ایمیل به‌صورت امن از طریق پلتفرم İşBul KKTC ارسال شده است.",
    rights: "تمامی حقوق محفوظ است.",
  },
};

const de: EmailCopy = {
  auth: {
    confirmationSubject: "Bestätigen Sie Ihre İşBul KKTC-E-Mail-Adresse",
    confirmationHeading: "Bestätigen Sie Ihre E-Mail-Adresse",
    confirmationLead:
      "Bestätigen Sie mit der Schaltfläche unten Ihre E-Mail-Adresse und aktivieren Sie Ihr İşBul KKTC-Konto.",
    confirmationCta: "E-Mail-Adresse bestätigen",
    confirmationFallback:
      "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
    confirmationIgnore:
      "Wenn Sie diese E-Mail nicht angefordert haben, können Sie sie ignorieren; der Link läuft bald ab.",
    recoverySubject: "Ihr İşBul KKTC-Link zum Zurücksetzen des Passworts",
    recoveryHeading: "Passwort zurücksetzen",
    recoveryLead:
      "Wir haben eine Anfrage zum Zurücksetzen des Passworts für Ihr Konto erhalten. Wählen Sie mit der Schaltfläche unten ein neues Passwort.",
    recoveryCta: "Neues Passwort festlegen",
    recoveryIgnore:
      "Wenn Sie dies nicht angefordert haben, ist keine Aktion nötig; Ihr Passwort bleibt unverändert.",
    reauthenticationSubject: "Ihr İşBul KKTC-Bestätigungscode",
    reauthenticationHeading: "Ihr Bestätigungscode",
    reauthenticationLead:
      "Geben Sie den unten stehenden Einmalcode ein, um fortzufahren. Teilen Sie diesen Code niemals.",
    reauthenticationIgnore:
      "Wenn Sie diesen Code nicht angefordert haben, können Sie ihn ignorieren.",
    passwordChangedSubject: "Ihr İşBul KKTC-Passwort wurde aktualisiert",
    passwordChangedHeading: "Ihr Passwort wurde aktualisiert",
    passwordChangedLead:
      "Das Passwort Ihres Kontos wurde erfolgreich geändert. Sie können sich jetzt mit dem neuen Passwort anmelden.",
    passwordChangedWarning:
      "Wenn Sie diese Änderung nicht vorgenommen haben, setzen Sie Ihr Passwort sofort zurück und kontaktieren Sie unseren Support.",
  },
  welcome: {
    candidateSubject: "Willkommen bei İşBul KKTC",
    candidateHeading: "Willkommen an Bord!",
    candidateLead:
      "Ihr Konto im vertrauenswürdigen Karrierenetzwerk Nordzyperns ist bereit. Vervollständigen Sie Ihr Profil und kommen Sie der passenden Stelle näher.",
    candidateSteps: [
      "Profil und Lebenslauf vervollständigen",
      "Angebote verifizierter Arbeitgeber durchsuchen",
      "Mit einem Klick bewerben und den Status verfolgen",
    ],
    candidateCta: "Profil vervollständigen",
    employerSubject: "Ihr İşBul KKTC-Arbeitgeberkonto ist bereit",
    employerHeading: "Willkommen in Ihrem Arbeitgeberkonto",
    employerLead:
      "Verifizieren Sie Ihr Unternehmensprofil und veröffentlichen Sie ein Angebot, um Nordzyperns größten Talentpool zu erreichen.",
    employerSteps: [
      "Unternehmensprofil verifizieren lassen",
      "Angebot erstellen und veröffentlichen",
      "Bewerbungen über ein Dashboard verwalten",
    ],
    employerCta: "Unternehmensprofil erstellen",
  },
  notification: {
    candidateAppliedSubject: "Ihre Bewerbung wurde übermittelt",
    candidateApplied:
      "Ihre Bewerbung wurde gespeichert und an das Arbeitgeberkonto übermittelt.",
    employerAppliedSubject: "Neue Bewerbung",
    employerApplied:
      "Ein Kandidat hat sich auf eine Stelle Ihres Unternehmens beworben.",
    viewedSubject: "Der Arbeitgeber hat Ihre Bewerbung angesehen",
    viewed: "Der Arbeitgeber hat Ihre Bewerbung erstmals angesehen.",
    statusSubject: "Ihr Bewerbungsstatus hat sich geändert",
    statusChanged: "Ihr neuer Bewerbungsstatus: {status}.",
    openDashboard: "Verfolgen Sie die Bewerbung in Ihrem Konto",
  },
  statuses: {
    submitted: "An Arbeitgeber übermittelt",
    reviewing: "Wird geprüft",
    shortlisted: "In der engeren Auswahl",
    rejected: "Nicht ausgewählt",
    hired: "Eingestellt",
    withdrawn: "Zurückgezogen",
  },
  feedback: {
    receivedSubject: "Danke für Ihr Feedback",
    receivedHeading: "Wir haben Ihr Feedback erhalten",
    receivedLead:
      "Danke, dass Sie İşBul KKTC besser machen. Unser Team prüft Ihre Nachricht.",
    receivedCta: "Angebote ansehen",
    teamSubject: "Neues Feedback eingegangen",
    teamHeading: "Neues Feedback eingegangen",
  },
  labels: {
    jobLabel: "Angebot",
    categoryLabel: "Thema",
    ratingLabel: "Bewertung",
    messageLabel: "Nachricht",
  },
  footer: {
    reason:
      "Sie erhalten diese E-Mail aufgrund einer Aktivität in Ihrem İşBul KKTC-Konto.",
    legal: "Diese E-Mail wurde sicher über die İşBul KKTC-Plattform versendet.",
    rights: "Alle Rechte vorbehalten.",
  },
};

export const EMAIL_COPY: Record<EmailLocale, EmailCopy> = {
  tr,
  en,
  ru,
  el,
  fa,
  de,
};

export function getEmailCopy(locale: string | null | undefined): EmailCopy {
  return EMAIL_COPY[resolveEmailLocale(locale)];
}
