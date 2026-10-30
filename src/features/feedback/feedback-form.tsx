"use client";

import { Send, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { submitFeedback } from "./actions";
import { feedbackCategorySchema, type FeedbackFormState } from "./schemas";

const initialState: FeedbackFormState = { status: "idle", message: "idle" };

export function FeedbackForm() {
  const copy = useTranslations("FeedbackForm");
  const locale = useLocale();
  const [state, action, pending] = useActionState(submitFeedback, initialState);
  const [rating, setRating] = useState(0);

  return (
    <form className="editorial-form feedback-form" action={action}>
      <input name="locale" type="hidden" value={locale} />
      <input name="rating" type="hidden" value={rating || ""} />

      <label htmlFor="feedback-category">
        {copy("categoryLabel")}
        <select
          id="feedback-category"
          name="category"
          defaultValue="general"
        >
          {feedbackCategorySchema.options.map((category) => (
            <option key={category} value={category}>
              {copy(`categories.${category}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="editorial-field">
        <span id="feedback-rating-label">{copy("ratingLabel")}</span>
        <div
          className="feedback-rating"
          role="group"
          aria-labelledby="feedback-rating-label"
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className="feedback-rating-star"
              aria-label={copy("ratingValue", { value })}
              aria-pressed={rating === value}
              data-active={rating >= value}
              onClick={() => setRating((current) => (current === value ? 0 : value))}
            >
              <Star size={20} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <label htmlFor="feedback-name">
        {copy("nameLabel")}
        <input
          id="feedback-name"
          autoComplete="name"
          maxLength={80}
          name="name"
        />
      </label>

      <label htmlFor="feedback-email">
        {copy("emailLabel")}
        <input
          id="feedback-email"
          autoComplete="email"
          name="email"
          type="email"
        />
      </label>

      <label htmlFor="feedback-message">
        {copy("messageLabel")}
        <textarea
          id="feedback-message"
          maxLength={4000}
          minLength={3}
          name="message"
          required
          rows={5}
        />
      </label>

      <button
        className="button button-dark editorial-submit editorial-auth-email-button"
        disabled={pending}
        type="submit"
      >
        <Send size={17} aria-hidden="true" />
        {pending ? copy("sending") : copy("submit")}
      </button>

      {state.message !== "idle" && (
        <p
          aria-live="polite"
          className="editorial-form-message"
          data-status={state.status}
          role={state.status === "error" ? "alert" : "status"}
        >
          {copy(`messages.${state.message}`)}
        </p>
      )}
      <p className="editorial-form-note">{copy("privacyNote")}</p>
    </form>
  );
}
