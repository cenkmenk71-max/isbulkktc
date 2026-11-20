"use server";

import { salesLeadSchema, type SalesLeadFormState } from "./schemas";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { sendSalesLeadEmails } from "@/server/email/mailer";
import { marketingConsentConfirmationUrlFor } from "@/server/email/marketing-consent-token";
import { salesLeadRateLimiter } from "@/features/abuse/limits";
import { clientIp } from "@/features/abuse/request-context";

const invalidForm: SalesLeadFormState = { status: "error", message: "invalid" };
// Same "try again later" copy as a send failure, so a scripted caller cannot
// confirm from the response that it tripped the throttle.
const throttledForm: SalesLeadFormState = { status: "error", message: "failed" };

/**
 * Accepts a corporate quote request, stores it through `submit_sales_lead` and,
 * on success, emails the prospect a receipt plus the team a copy.
 *
 * Same contract as feedback: the stored row is the source of truth, so a mail
 * failure never turns a stored lead into an error for the visitor.
 */
export async function submitSalesLead(
  _previousState: SalesLeadFormState,
  formData: FormData,
): Promise<SalesLeadFormState> {
  const result = salesLeadSchema.safeParse({
    companyName: formData.get("companyName") ?? "",
    contactName: formData.get("contactName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    plan: formData.get("plan") ?? "",
    durationDays: formData.get("durationDays") ?? "",
    note: formData.get("note") ?? "",
    locale: formData.get("locale") ?? "tr",
    marketingConsent: formData.get("marketingConsent") === "true",
  });

  if (!result.success) return invalidForm;

  const ip = await clientIp();

  // Throttle before the RPC and the mail it triggers: the receipt goes to the
  // submitted address and the team gets a copy. Per address and per origin, so
  // both a single attacker and a single victim mailbox are bounded.
  if (!salesLeadRateLimiter.check(`ip:${ip}`).ok) {
    return throttledForm;
  }
  if (!salesLeadRateLimiter.check(`email:${result.data.email}`).ok) {
    return throttledForm;
  }

  const durationDays =
    result.data.durationDays && result.data.durationDays.length > 0
      ? Number(result.data.durationDays)
      : null;

  const supabase = await createSupabaseServerClient();
  // Forward the visitor address so the DB throttle keys on it (#206); see the
  // note in `src/features/feedback/actions.ts`.
  const legacyArgs = {
    _company_name: result.data.companyName || null,
    _contact_name: result.data.contactName || null,
    _email: result.data.email,
    _phone: result.data.phone || null,
    _plan: result.data.plan || null,
    _duration_days: durationDays,
    _note: result.data.note || null,
    _locale: result.data.locale,
  };

  let submission = await supabase
    .rpc("submit_sales_lead", {
      ...legacyArgs,
      _marketing_consent: result.data.marketingConsent,
    })
    .setHeader("x-client-ip", ip);

  // Production may briefly lag the application migration. The legacy 8-argument
  // RPC is still present there. It is safe to use only when the visitor did not
  // opt into marketing: that function stores no consent, so never silently drop
  // an affirmative consent choice.
  if (submission.error?.code === "PGRST202") {
    if (result.data.marketingConsent) {
      console.error("Sales lead consent could not be recorded because the consent-aware RPC is unavailable.");
      return { status: "error", message: "consentUnavailable" };
    }

    console.warn("Sales lead used the legacy no-consent RPC while the consent-aware migration is pending.");
    submission = await supabase
      .rpc("submit_sales_lead", legacyArgs)
      .setHeader("x-client-ip", ip);
  }

  const { data, error } = submission;
  if (error || typeof data !== "string") {
    console.error("Sales lead submission failed.", { code: error?.code });
    return { status: "error", message: "failed" };
  }

  try {
    const marketingConsentConfirmationUrl = result.data.marketingConsent
      ? marketingConsentConfirmationUrlFor(data, result.data.locale, result.data.email)
      : null;
    await sendSalesLeadEmails({
      companyName: result.data.companyName || null,
      contactName: result.data.contactName || null,
      email: result.data.email,
      locale: result.data.locale,
      plan: result.data.plan || null,
      durationDays,
      note: result.data.note || null,
      leadId: data,
      marketingConsentConfirmationUrl,
    });
  } catch (mailError) {
    console.error("Sales lead email could not be sent.", {
      error: mailError instanceof Error ? mailError.message : "unknown_error",
    });
  }

  return { status: "success", message: "submitted" };
}
