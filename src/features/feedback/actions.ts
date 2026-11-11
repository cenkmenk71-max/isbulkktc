"use server";

import { feedbackSchema, type FeedbackFormState } from "./schemas";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { sendFeedbackEmails } from "@/server/email/mailer";
import { feedbackRateLimiter } from "@/features/abuse/limits";
import { clientIp } from "@/features/abuse/request-context";

const invalidForm: FeedbackFormState = { status: "error", message: "invalid" };
// Throttling answers with the same "try again later" copy as a send failure, so
// a scripted caller cannot confirm from the response that it tripped a limit.
const throttledForm: FeedbackFormState = { status: "error", message: "failed" };

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

  const ip = await clientIp();

  // Throttle before the RPC and the mail it triggers. Per client address and
  // per submitted address, so neither one origin nor one victim mailbox floods.
  if (!feedbackRateLimiter.check(`ip:${ip}`).ok) {
    return throttledForm;
  }
  if (
    result.data.email &&
    !feedbackRateLimiter.check(`email:${result.data.email}`).ok
  ) {
    return throttledForm;
  }

  const supabase = await createSupabaseServerClient();
  // Forward the visitor address so the DB throttle keys on it. supabase-js
  // sends no IP header of its own, and the RPC's edge-written `cf-connecting-ip`
  // is the platform's shared egress address on this path, so without the
  // explicit header every app submission collapses onto one bucket (#206).
  const { data, error } = await supabase
    .rpc("submit_feedback", {
      _name: result.data.name || null,
      _email: result.data.email || null,
      _category: result.data.category,
      _rating: result.data.rating ?? null,
      _message: result.data.message,
      _locale: result.data.locale,
    })
    .setHeader("x-client-ip", ip);

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
