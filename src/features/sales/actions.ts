"use server";

import { salesLeadSchema, type SalesLeadFormState } from "./schemas";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { sendSalesLeadEmails } from "@/server/email/mailer";

const invalidForm: SalesLeadFormState = { status: "error", message: "invalid" };

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
  });

  if (!result.success) return invalidForm;

  const durationDays =
    result.data.durationDays && result.data.durationDays.length > 0
      ? Number(result.data.durationDays)
      : null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_sales_lead", {
    _company_name: result.data.companyName || null,
    _contact_name: result.data.contactName || null,
    _email: result.data.email,
    _phone: result.data.phone || null,
    _plan: result.data.plan || null,
    _duration_days: durationDays,
    _note: result.data.note || null,
    _locale: result.data.locale,
  });

  if (error || typeof data !== "string") {
    console.error("Sales lead submission failed.", { code: error?.code });
    return { status: "error", message: "failed" };
  }

  try {
    await sendSalesLeadEmails({
      companyName: result.data.companyName || null,
      contactName: result.data.contactName || null,
      email: result.data.email,
      locale: result.data.locale,
      plan: result.data.plan || null,
      durationDays,
      note: result.data.note || null,
      leadId: data,
    });
  } catch (mailError) {
    console.error("Sales lead email could not be sent.", {
      error: mailError instanceof Error ? mailError.message : "unknown_error",
    });
  }

  return { status: "success", message: "submitted" };
}
