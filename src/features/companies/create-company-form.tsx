"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { createCompany } from "./actions";
import {
  finalizeSlug,
  normalizeSlugInput,
  slugifyCompanyName,
} from "./company-slug";

const initialState = { status: "idle" as const, message: "idle" as const };

export function CreateCompanyForm() {
  const copy = useTranslations("CompanyRegistration");
  const [state, action, pending] = useActionState(createCompany, initialState);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const nameId = useId();
  const slugId = useId();

  const effectiveSlug =
    slugTouched && slug ? slug : slugifyCompanyName(name);

  return (
    <form className="editorial-form" action={action}>
      <label htmlFor={nameId}>
        {copy("nameLabel")}
        <input
          autoComplete="organization"
          id={nameId}
          maxLength={120}
          minLength={2}
          name="name"
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder={copy("namePlaceholder")}
          required
          value={name}
        />
      </label>
      <label htmlFor={slugId}>
        {copy("slugLabel")}
        <input
          autoComplete="off"
          id={slugId}
          maxLength={80}
          minLength={2}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(normalizeSlugInput(event.currentTarget.value));
          }}
          pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*"
          required
          value={effectiveSlug}
        />
        <small>{copy("slugHint")}</small>
      </label>
      <input name="slug" type="hidden" value={finalizeSlug(effectiveSlug)} />
      <p className="editorial-form-note">
        {copy("slugPurpose")}
        {effectiveSlug ? (
          <>
            {" "}
            {copy("slugPreviewLabel")} <code>{effectiveSlug}</code>
          </>
        ) : null}
      </p>
      <button
        className="button button-dark editorial-submit"
        disabled={pending}
        type="submit"
      >
        {pending ? copy("saving") : copy("submit")}
      </button>
      <p
        aria-live="polite"
        className="editorial-form-message"
        data-status={state.status}
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.message === "idle" ? "" : copy(`messages.${state.message}`)}
      </p>
    </form>
  );
}
