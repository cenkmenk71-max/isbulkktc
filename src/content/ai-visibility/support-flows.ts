import type { AppLocale } from "@/i18n/routing";

/**
 * Procedural facts for the live-support bot: how the platform's own flows work,
 * written per language from the interface copy the product already ships.
 *
 * The FAQ bundle (`faq.ts`) answers *what* İşBul KKTC is; these entries answer
 * *how* its flows work, which is what a support visitor most often asks and what
 * the FAQ alone cannot place. Every sentence is derived from a string the
 * interface already renders, never invented:
 *
 *   password reset   `AuthForms.forgotPassword/resetLinkNote/passwordHint`
 *   account creation `AuthForms.createCandidateAccount/createEmployerAccount`,
 *                    `AccountPages.register.*`
 *   email verification `AuthForms.resendVerification`
 *   applying         `JobApplication.description/coverLetterHint/messages.*`
 *   employer listing `CompanyRegistration.description/storyBody`,
 *                    `HomeJourney.employer.*`
 *   CV privacy       `HomeJourney.candidate.privacy`
 *
 * Two consumers read this catalogue: `answerFromKnowledge` matches a visitor
 * question against `question` and answers with `answer` in-process (no model,
 * no cost, no hallucination), and `buildSupportSystemPrompt` feeds `answer` into
 * the model's facts block so a paraphrased how-to question is still grounded.
 *
 * `question` exists for matching only; the prompt renders the `answer` alone.
 */

export interface SupportFlow {
  question: string;
  answer: string;
}

export const supportFlowsByLocale: Record<AppLocale, readonly SupportFlow[]> = {
  tr: [
    {
      question: "Şifremi nasıl sıfırlarım?",
      answer:
        "Şifre sıfırlama: giriş sayfasındaki \"Şifrenizi mi unuttunuz?\" bağlantısını kullanın; e-posta adresinize kısa süre geçerli bir yenileme bağlantısı gönderilir. Bağlantıyı açıp yeni şifrenizi belirleyin; yeni şifre en az 10 karakter olmalıdır.",
    },
    {
      question: "Nasıl hesap oluştururum?",
      answer:
        "Hesap oluşturma aday ve işveren için ayrıdır. Aday olarak e-posta adresiniz ve en az 10 karakterlik bir şifreyle aday hesabı oluşturur, e-postanızı doğruladıktan sonra profilinizi tamamlarsınız. İşveren olarak önce yetkili kişi adına bir işveren hesabı oluşturur, e-postanızı doğruladıktan sonra şirket bilgilerinizi ayrı bir kayıt adımında eklersiniz.",
    },
    {
      question: "E-posta adresimi nasıl doğrularım?",
      answer:
        "E-posta doğrulama: kayıt sonrası e-posta adresinize bir doğrulama bağlantısı gönderilir. Giriş yapmadan önce bu bağlantıyı açmanız gerekir; bağlantıya ulaşamazsanız doğrulama e-postasını yeniden gönderebilirsiniz.",
    },
    {
      question: "İlana nasıl başvururum?",
      answer:
        "Başvuru: bir ilana başvurmak için giriş yapmanız ve aday profilinizin olması gerekir. Başvuru, ilan sayfasındaki formdan gönderilir; başvurunuz siteye kaydedilir ve ilgili işverenin hesabına iletilir. İsteğe bağlı bir ön yazı ekleyebilirsiniz (en fazla 5.000 karakter) ve aynı ilana yalnızca bir kez başvurabilirsiniz.",
    },
    {
      question: "İşveren olarak nasıl ilan veririm?",
      answer:
        "İşveren ilan süreci: önce şirketinizi kaydedersiniz. Gönderdiğiniz şirket bilgileri inceleme sürecine alınır; doğrulama tamamlanıp yayın yetkisi tanımlanana kadar ilan yayımlanamaz.",
    },
    {
      question: "CV dosyam güvenli mi?",
      answer:
        "CV gizliliği: CV dosyanız sunucuya yüklenmez; ayrıştırma tarayıcınızda yapılır ve dosya tarayıcınızda kalır.",
    },
  ],
  en: [
    {
      question: "How do I reset my password?",
      answer:
        "Password reset: use the \"Forgot your password?\" link on the sign-in page; we send a short-lived reset link to your email address. Open the link and set a new password — it must be at least 10 characters.",
    },
    {
      question: "How do I create an account?",
      answer:
        "Account creation is separate for candidates and employers. As a candidate, create a candidate account with your email and a password of at least 10 characters, verify your email, then complete your profile. As an employer, first create an employer account for the company contact; after verifying your email, add your company details in a separate registration step.",
    },
    {
      question: "How do I verify my email?",
      answer:
        "Email verification: after registering, we send a verification link to your email address. You must open it before you can sign in; if you cannot find it, you can resend the verification email.",
    },
    {
      question: "How do I apply for a job?",
      answer:
        "Applying: to apply for a job you must sign in and have a candidate profile. Apply from the form on the job page; your application is saved on the site and delivered to the employer's account. You may add an optional cover letter (up to 5,000 characters), and you can apply for the same role only once.",
    },
    {
      question: "How do I post a job as an employer?",
      answer:
        "Employer listing: you register your company first. Submitted company details enter the review process; listings cannot be published until verification is complete and posting access is granted.",
    },
    {
      question: "Is my CV file safe?",
      answer:
        "CV privacy: your CV file is not uploaded to the server; it is parsed in your browser and stays there.",
    },
  ],
  de: [
    {
      question: "Wie setze ich mein Passwort zurück?",
      answer:
        "Passwort zurücksetzen: Nutzen Sie den Link \"Passwort vergessen?\" auf der Anmeldeseite; wir senden einen kurz gültigen Link an Ihre E-Mail-Adresse. Öffnen Sie den Link und legen Sie ein neues Passwort fest — es muss mindestens 10 Zeichen lang sein.",
    },
    {
      question: "Wie erstelle ich ein Konto?",
      answer:
        "Die Kontoerstellung ist für Bewerbende und Arbeitgebende getrennt. Als Bewerbende erstellen Sie ein Bewerberkonto mit Ihrer E-Mail und einem Passwort von mindestens 10 Zeichen, bestätigen Ihre E-Mail und vervollständigen dann Ihr Profil. Als Arbeitgebende erstellen Sie zuerst ein Arbeitgeberkonto für die Kontaktperson; nach der Bestätigung Ihrer E-Mail ergänzen Sie die Unternehmensdaten in einem separaten Schritt.",
    },
    {
      question: "Wie bestätige ich meine E-Mail-Adresse?",
      answer:
        "E-Mail-Bestätigung: Nach der Registrierung senden wir einen Bestätigungslink an Ihre E-Mail-Adresse. Sie müssen ihn öffnen, bevor Sie sich anmelden können; wenn Sie ihn nicht finden, können Sie die Bestätigungs-E-Mail erneut senden.",
    },
    {
      question: "Wie bewerbe ich mich auf eine Stelle?",
      answer:
        "Bewerbung: Um sich auf eine Stelle zu bewerben, müssen Sie angemeldet sein und ein Bewerberprofil haben. Die Bewerbung erfolgt über das Formular auf der Stellenseite; sie wird auf der Website gespeichert und dem Arbeitgeberkonto übermittelt. Optional können Sie ein Anschreiben hinzufügen (bis zu 5.000 Zeichen); auf dieselbe Stelle können Sie sich nur einmal bewerben.",
    },
    {
      question: "Wie veröffentliche ich als Arbeitgeber eine Stellenanzeige?",
      answer:
        "Stellenanzeige veröffentlichen: Als Arbeitgebende registrieren Sie zuerst Ihr Unternehmen. Die eingereichten Unternehmensdaten werden geprüft; Anzeigen können erst veröffentlicht werden, wenn die Bestätigung abgeschlossen und das Veröffentlichungsrecht erteilt ist.",
    },
    {
      question: "Ist meine Lebenslaufdatei sicher?",
      answer:
        "Lebenslauf-Datenschutz: Ihre Lebenslaufdatei wird nicht auf den Server hochgeladen; sie wird in Ihrem Browser verarbeitet und bleibt dort.",
    },
  ],
  ru: [
    {
      question: "Как сбросить пароль?",
      answer:
        "Сброс пароля: воспользуйтесь ссылкой «Забыли пароль?» на странице входа; мы отправим на вашу электронную почту краткосрочную ссылку для сброса. Откройте ссылку и задайте новый пароль — он должен содержать не менее 10 символов.",
    },
    {
      question: "Как создать аккаунт?",
      answer:
        "Создание аккаунта разделено для кандидатов и работодателей. Как кандидат, создайте аккаунт кандидата с электронной почтой и паролем не менее 10 символов, подтвердите почту и заполните профиль. Как работодатель, сначала создайте аккаунт работодателя для контактного лица; после подтверждения почты добавьте сведения о компании отдельным шагом.",
    },
    {
      question: "Как подтвердить электронную почту?",
      answer:
        "Подтверждение почты: после регистрации мы отправляем ссылку для подтверждения на вашу электронную почту. Её нужно открыть до входа; если письмо не пришло, можно отправить письмо с подтверждением повторно.",
    },
    {
      question: "Как откликнуться на вакансию?",
      answer:
        "Отклик: чтобы откликнуться на вакансию, нужно войти в аккаунт и иметь профиль кандидата. Отклик отправляется через форму на странице вакансии; он сохраняется на сайте и передаётся в кабинет работодателя. Можно добавить сопроводительное письмо (до 5 000 символов); на одну вакансию можно откликнуться только один раз.",
    },
    {
      question: "Как работодателю опубликовать вакансию?",
      answer:
        "Публикация вакансии: как работодатель вы сначала регистрируете компанию. Отправленные данные компании проходят проверку; публикация объявлений недоступна до завершения проверки и предоставления прав на публикацию.",
    },
    {
      question: "Мой файл резюме в безопасности?",
      answer:
        "Конфиденциальность резюме: файл резюме не загружается на сервер; он обрабатывается в вашем браузере и остаётся там.",
    },
  ],
  el: [
    {
      question: "Πώς να επαναφέρω τον κωδικό μου;",
      answer:
        "Επαναφορά κωδικού: χρησιμοποιήστε τον σύνδεσμο «Ξεχάσατε τον κωδικό;» στη σελίδα σύνδεσης· στέλνουμε έναν σύνδεσμο επαναφοράς σύντομης ισχύος στο email σας. Ανοίξτε τον σύνδεσμο και ορίστε νέο κωδικό — πρέπει να έχει τουλάχιστον 10 χαρακτήρες.",
    },
    {
      question: "Πώς να δημιουργήσω λογαριασμό;",
      answer:
        "Η δημιουργία λογαριασμού είναι ξεχωριστή για υποψηφίους και εργοδότες. Ως υποψήφιος, δημιουργήστε λογαριασμό υποψηφίου με το email σας και κωδικό τουλάχιστον 10 χαρακτήρων, επιβεβαιώστε το email και συμπληρώστε το προφίλ σας. Ως εργοδότης, δημιουργήστε πρώτα λογαριασμό εργοδότη για τον υπεύθυνο επικοινωνίας· μετά την επιβεβαίωση του email, προσθέστε τα στοιχεία της εταιρείας σε ξεχωριστό βήμα.",
    },
    {
      question: "Πώς να επιβεβαιώσω το email μου;",
      answer:
        "Επιβεβαίωση email: μετά την εγγραφή, στέλνουμε σύνδεσμο επιβεβαίωσης στο email σας. Πρέπει να τον ανοίξετε πριν συνδεθείτε· αν δεν τον βρείτε, μπορείτε να στείλετε ξανά το email επιβεβαίωσης.",
    },
    {
      question: "Πώς να υποβάλω αίτηση για θέση εργασίας;",
      answer:
        "Αίτηση: για να υποβάλετε αίτηση, πρέπει να συνδεθείτε και να έχετε προφίλ υποψηφίου. Η αίτηση υποβάλλεται από τη φόρμα στη σελίδα της θέσης· αποθηκεύεται στον ιστότοπο και παραδίδεται στον λογαριασμό του εργοδότη. Μπορείτε να προσθέσετε προαιρετική συνοδευτική επιστολή (έως 5.000 χαρακτήρες)· για την ίδια θέση μπορείτε να υποβάλετε αίτηση μόνο μία φορά.",
    },
    {
      question: "Πώς να δημοσιεύσω αγγελία ως εργοδότης;",
      answer:
        "Δημοσίευση αγγελίας: ως εργοδότης, καταχωρίζετε πρώτα την εταιρεία σας. Τα υποβληθέντα στοιχεία περνούν από έλεγχο· οι αγγελίες δεν μπορούν να δημοσιευτούν πριν ολοκληρωθεί η επαλήθευση και ενεργοποιηθούν τα σχετικά δικαιώματα.",
    },
    {
      question: "Είναι ασφαλές το αρχείο βιογραφικού μου;",
      answer:
        "Ιδιωτικότητα βιογραφικού: το αρχείο βιογραφικού δεν ανεβαίνει στον διακομιστή· επεξεργάζεται στο πρόγραμμα περιήγησής σας και παραμένει εκεί.",
    },
  ],
  fa: [
    {
      question: "چگونه گذرواژه‌ام را بازنشانی کنم؟",
      answer:
        "بازنشانی گذرواژه: از پیوند «گذرواژه را فراموش کرده‌اید؟» در صفحه ورود استفاده کنید؛ پیوندی کوتاه‌مدت برای بازنشانی به ایمیل شما ارسال می‌شود. پیوند را باز کنید و گذرواژه جدید تعیین کنید — گذرواژه باید حداقل ۱۰ نویسه باشد.",
    },
    {
      question: "چگونه حساب بسازم؟",
      answer:
        "ساخت حساب برای متقاضیان و کارفرمایان جداگانه است. به‌عنوان متقاضی، با ایمیل و گذرواژه‌ای حداقل ۱۰ نویسه حساب متقاضی بسازید، ایمیل را تأیید و سپس پروفایل را تکمیل کنید. به‌عنوان کارفرما، ابتدا برای رابط شرکت حساب کارفرما بسازید؛ پس از تأیید ایمیل، اطلاعات شرکت را در مرحله‌ای جداگانه اضافه کنید.",
    },
    {
      question: "چگونه ایمیل خود را تأیید کنم؟",
      answer:
        "تأیید ایمیل: پس از ثبت‌نام، پیوند تأییدی به ایمیل شما ارسال می‌شود. باید پیش از ورود آن را باز کنید؛ اگر آن را پیدا نکردید، می‌توانید ایمیل تأیید را دوباره ارسال کنید.",
    },
    {
      question: "چگونه برای شغل درخواست بدهم؟",
      answer:
        "ارسال درخواست: برای درخواست باید وارد شوید و پروفایل متقاضی داشته باشید. درخواست از فرم صفحه شغل ارسال می‌شود؛ درخواست شما در سایت ثبت و به حساب کارفرما تحویل داده می‌شود. می‌توانید نامه همراه اختیاری اضافه کنید (حداکثر ۵۰۰۰ نویسه)؛ برای یک شغل فقط یک‌بار می‌توانید درخواست بدهید.",
    },
    {
      question: "چگونه به‌عنوان کارفرما آگهی منتشر کنم؟",
      answer:
        "انتشار آگهی: به‌عنوان کارفرما ابتدا شرکت خود را ثبت می‌کنید. اطلاعات ارسالی شرکت بررسی می‌شود؛ تا تکمیل تأیید و فعال‌شدن مجوز انتشار، امکان انتشار آگهی وجود ندارد.",
    },
    {
      question: "آیا فایل رزومه‌ام امن است؟",
      answer:
        "حریم رزومه: فایل رزومه به سرور بارگذاری نمی‌شود؛ در مرورگر شما پردازش می‌شود و همان‌جا می‌ماند.",
    },
  ],
};
