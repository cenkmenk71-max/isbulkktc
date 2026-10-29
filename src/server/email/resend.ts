/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import "server-only";
import { Resend } from "resend";
import {
  renderNewApplicationEmployerEmail,
  renderApplicationReceivedCandidateEmail,
  renderApplicationStatusUpdateEmail,
  renderContactFormInquiryEmail,
} from "./templates";

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || "İşBul KKTC <bildirim@isbulkktc.com>";

const resendClient = resendApiKey ? new Resend(resendApiKey) : null;

export type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

/**
 * Gönderim çekirdek fonksiyonu
 */
export async function sendTransactionalEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  if (!resendClient || !resendApiKey) {
    // Fail closed. Returning success here marked the outbox row as delivered
    // while no email left the system, so a missing key silently dropped every
    // notification. The worker's retry/backoff handles the failure honestly.
    console.error(
      "[Resend] RESEND_API_KEY is not configured; refusing to send.",
      { subject: options.subject, recipients },
    );
    return {
      success: false,
      error: "RESEND_API_KEY_MISSING",
    };
  }

  try {
    const { data, error } = await resendClient.emails.send({
      from: fromEmail,
      to: recipients,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
    });

    if (error) {
      console.error("[Resend Error]", error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Bilinmeyen e-posta gönderim hatası";
    console.error("[Resend Exception]", message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * İşverene yeni başvuru e-postası gönder
 */
export async function notifyEmployerNewApplication(params: {
  employerEmail: string;
  employerName: string;
  candidateName: string;
  jobTitle: string;
  applicationUrl: string;
}): Promise<SendEmailResult> {
  const { subject, html } = renderNewApplicationEmployerEmail(params);
  return sendTransactionalEmail({
    to: params.employerEmail,
    subject,
    html,
  });
}

/**
 * Adaya başvurunun iletildiğini bildir
 */
export async function notifyCandidateApplicationReceived(params: {
  candidateEmail: string;
  candidateName: string;
  companyName: string;
  jobTitle: string;
  statusUrl: string;
}): Promise<SendEmailResult> {
  const { subject, html } = renderApplicationReceivedCandidateEmail(params);
  return sendTransactionalEmail({
    to: params.candidateEmail,
    subject,
    html,
  });
}

/**
 * Adaya başvuru durumu değişikliğini bildir (İncelendi / Mülakat vb.)
 */
export async function notifyCandidateStatusChange(params: {
  candidateEmail: string;
  candidateName: string;
  companyName: string;
  jobTitle: string;
  newStatus: string;
  note?: string;
  actionUrl: string;
}): Promise<SendEmailResult> {
  const { subject, html } = renderApplicationStatusUpdateEmail(params);
  return sendTransactionalEmail({
    to: params.candidateEmail,
    subject,
    html,
  });
}

/**
 * İletişim formu mesajını yöneticiye ilet
 */
export async function notifyContactInquiry(params: {
  adminEmail: string;
  senderName: string;
  senderEmail: string;
  subjectLine: string;
  message: string;
}): Promise<SendEmailResult> {
  const { subject, html } = renderContactFormInquiryEmail(params);
  return sendTransactionalEmail({
    to: params.adminEmail,
    replyTo: params.senderEmail,
    subject,
    html,
  });
}
