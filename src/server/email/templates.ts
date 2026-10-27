/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import "server-only";

export type EmailTemplateProps = {
  candidateName?: string;
  employerName?: string;
  jobTitle?: string;
  applicationUrl?: string;
  statusText?: string;
  messageContent?: string;
  interviewDate?: string;
  locale?: string;
};

const brandPrimary = "#0D5C3A";
const brandAccent = "#F5F2EB";
const brandDark = "#1A1A1A";
const brandMuted = "#6B7280";

function baseEmailWrapper(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: ${brandAccent}; margin: 0; padding: 0; color: ${brandDark}; }
    .container { max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    .header { background: ${brandPrimary}; padding: 28px 32px; text-align: left; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 4px 0 0; color: rgba(255,255,255,0.85); font-size: 13px; }
    .body { padding: 32px; }
    .btn { display: inline-block; background-color: ${brandPrimary}; color: #ffffff !important; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 18px; }
    .card { background-color: ${brandAccent}; border-radius: 8px; padding: 18px; margin: 20px 0; border: 1px solid rgba(0,0,0,0.06); }
    .footer { padding: 24px 32px; background: #fbfbfa; border-top: 1px solid #eeeeee; text-align: center; font-size: 12px; color: ${brandMuted}; }
    .footer a { color: ${brandPrimary}; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>İşBul KKTC</h1>
      <p>Kuzey Kıbrıs’ın Güvenilir Kariyer ve İstihdam Ağı</p>
    </div>
    <div class="body">
      ${contentHtml}
    </div>
    <div class="footer">
      <p>Bu e-posta <strong>İşBul KKTC</strong> platformu üzerinden güvenli bir şekilde gönderilmiştir.</p>
      <p>Kuzey Kıbrıs Türk Cumhuriyeti · <a href="https://isbulkktc.com">isbulkktc.com</a></p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * İşverene: Yeni iş başvurusu bildirimi
 */
export function renderNewApplicationEmployerEmail(props: {
  employerName: string;
  candidateName: string;
  jobTitle: string;
  applicationUrl: string;
}): { subject: string; html: string } {
  const subject = `Yeni Başvuru: ${props.candidateName} - ${props.jobTitle} | İşBul KKTC`;
  const html = baseEmailWrapper(
    subject,
    `
    <h2 style="margin-top: 0; font-size: 18px; color: ${brandDark};">Sayın ${props.employerName} Yetkilisi,</h2>
    <p style="font-size: 15px; line-height: 1.6;">
      Yayınlamış olduğunuz <strong>"${props.jobTitle}"</strong> pozisyonu için yeni bir başvuru alındı.
    </p>
    <div class="card">
      <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Aday:</strong> ${props.candidateName}</p>
      <p style="margin: 0; font-size: 14px;"><strong>İlan:</strong> ${props.jobTitle}</p>
    </div>
    <p style="font-size: 14px; line-height: 1.5; color: ${brandMuted};">
      Adayın özgeçmişini ve başvuru detaylarını işveren panelinizden hemen inceleyebilir, adayla doğrudan iletişime geçebilirsiniz.
    </p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${props.applicationUrl}" class="btn">Başvuruyu Görüntüle ve Yanıtla</a>
    </div>
    `,
  );
  return { subject, html };
}

/**
 * Adaya: Başvurunun alındığına dair onay e-postası
 */
export function renderApplicationReceivedCandidateEmail(props: {
  candidateName: string;
  companyName: string;
  jobTitle: string;
  statusUrl: string;
}): { subject: string; html: string } {
  const subject = `Başvurunuz İletildi: ${props.jobTitle} (${props.companyName}) | İşBul KKTC`;
  const html = baseEmailWrapper(
    subject,
    `
    <h2 style="margin-top: 0; font-size: 18px; color: ${brandDark};">Merhaba ${props.candidateName},</h2>
    <p style="font-size: 15px; line-height: 1.6;">
      <strong>${props.companyName}</strong> şirketinin <strong>"${props.jobTitle}"</strong> pozisyonu için yaptığınız başvuru işverene başarıyla iletilmiştir.
    </p>
    <div class="card">
      <p style="margin: 0 0 6px 0; font-size: 14px;"><strong>Şirket:</strong> ${props.companyName}</p>
      <p style="margin: 0 0 6px 0; font-size: 14px;"><strong>Pozisyon:</strong> ${props.jobTitle}</p>
      <p style="margin: 0; font-size: 14px; color: ${brandPrimary};"><strong>Durum:</strong> İletildi (İnceleme Bekliyor)</p>
    </div>
    <p style="font-size: 14px; line-height: 1.5; color: ${brandMuted};">
      İşveren başvurunuzu görüntülediğinde veya durumunu güncellediğinde sizi bilgilendireceğiz.
    </p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${props.statusUrl}" class="btn">Başvuru Durumunu Takip Et</a>
    </div>
    `,
  );
  return { subject, html };
}

/**
 * Adaya: Başvuru durumu güncellendi (İncelendi / Mülakat Daveti)
 */
export function renderApplicationStatusUpdateEmail(props: {
  candidateName: string;
  companyName: string;
  jobTitle: string;
  newStatus: string;
  note?: string;
  actionUrl: string;
}): { subject: string; html: string } {
  const subject = `Başvuru Durumu Güncellendi: ${props.jobTitle} (${props.companyName})`;
  const html = baseEmailWrapper(
    subject,
    `
    <h2 style="margin-top: 0; font-size: 18px; color: ${brandDark};">Merhaba ${props.candidateName},</h2>
    <p style="font-size: 15px; line-height: 1.6;">
      <strong>${props.companyName}</strong> firması <strong>"${props.jobTitle}"</strong> pozisyonuna yaptığınız başvuru durumunu güncelledi:
    </p>
    <div class="card" style="border-left: 4px solid ${brandPrimary};">
      <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 700; color: ${brandPrimary};">
        Yeni Durum: ${props.newStatus}
      </p>
      ${props.note ? `<p style="margin: 8px 0 0; font-size: 14px; color: ${brandDark};"><strong>İşveren Notu:</strong> ${props.note}</p>` : ""}
    </div>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${props.actionUrl}" class="btn">Detayları İncele</a>
    </div>
    `,
  );
  return { subject, html };
}

/**
 * İletişim / Teklif Formu Bildirimi (Site Yöneticisine)
 */
export function renderContactFormInquiryEmail(props: {
  senderName: string;
  senderEmail: string;
  subjectLine: string;
  message: string;
}): { subject: string; html: string } {
  const subject = `[İletişim Formu] ${props.subjectLine} - ${props.senderName}`;
  const html = baseEmailWrapper(
    subject,
    `
    <h2 style="margin-top: 0; font-size: 18px; color: ${brandDark};">Yeni İletişim Mesajı</h2>
    <div class="card">
      <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Gönderen:</strong> ${props.senderName}</p>
      <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>E-posta:</strong> <a href="mailto:${props.senderEmail}">${props.senderEmail}</a></p>
      <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Konu:</strong> ${props.subjectLine}</p>
      <hr style="border: none; border-top: 1px solid rgba(0,0,0,0.08); margin: 12px 0;">
      <p style="margin: 0; font-size: 14px; line-height: 1.6; white-space: pre-line;">${props.message}</p>
    </div>
    <div style="text-align: center; margin: 28px 0;">
      <a href="mailto:${props.senderEmail}" class="btn">Yanıtla</a>
    </div>
    `,
  );
  return { subject, html };
}
