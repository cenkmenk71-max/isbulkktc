"use server";

import { feedbackSchema, type FeedbackFormState } from "./schemas";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { sendFeedbackEmails } from "@/server/email/mailer";

const invalidForm: FeedbackFormState = { status: "error", message: "invalid" };

/**
 * Accepts a feedback / contact message, stores it through the `submit_feedback`
 * RPC and, on success, emails the sender a receipt and the team a copy.
 *
 * Email is best-effort: a delivery problem never turns a stored submission into
 * an error for the visitor, because the row is the source of truth.
 */
export async function submitFeedback(
  _previousState: FeedbackFormState,
  formData: FormData,
): Promise<FeedbackFormState> {
  const ratingValue = formData.get("rating");
  const result = feedbackSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    category: formData.get("category") ?? "general",
    rating:
      typeof ratingValue === "string" && ratingValue.length > 0
        ? ratingValue
        : undefined,
    message: formData.get("message") ?? "",
    locale: formData.get("locale") ?? "tr",
  });

  if (!result.success) return invalidForm;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_feedback", {
    _name: result.data.name || null,
    _email: result.data.email || null,
    _category: result.data.category,
    _rating: result.data.rating ?? null,
    _message: result.data.message,
    _locale: result.data.locale,
  });

  if (error || typeof data !== "string") {
    console.error("Feedback submission failed.", { code: error?.code });
    return { status: "error", message: "failed" };
  }

  try {
    await sendFeedbackEmails({
      name: result.data.name || null,
      email: result.data.email || null,
      locale: result.data.locale,
      category: result.data.category,
      rating: result.data.rating ?? null,
      message: result.data.message,
      feedbackId: data,
    });
  } catch (mailError) {
    console.error("Feedback email could not be sent.", {
      error: mailError instanceof Error ? mailError.message : "unknown_error",
    });
  }

  return { status: "success", message: "submitted" };
}
