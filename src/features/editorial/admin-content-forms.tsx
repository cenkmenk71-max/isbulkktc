"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  deleteFaqEntry,
  saveFaqEntry,
  saveLegalDocument,
  saveListingPlan,
} from "./admin-content-actions";
import {
  adminContentLocales,
  adminLegalKeys,
  type AdminContentActionState,
} from "./admin-content-schemas";

const initialState: AdminContentActionState = {
  status: "idle",
  message: "idle",
};

type AdminCopy = ReturnType<typeof useTranslations<"AdminContent">>;

const localeLabelKeys = {
  tr: "localeTr",
  en: "localeEn",
  ru: "localeRu",
  el: "localeEl",
  fa: "localeFa",
  de: "localeDe",
} as const satisfies Record<(typeof adminContentLocales)[number], string>;

function localeLabel(copy: AdminCopy, locale: string): string {
  const key = localeLabelKeys[locale as keyof typeof localeLabelKeys];
  return key ? copy(key) : locale;
}

function ActionMessage({ state }: { state: AdminContentActionState }) {
  const copy = useTranslations("AdminContent");
  if (state.status === "idle" || state.message === "idle") return null;
  const messageKey = `messages.${state.message}` as Parameters<typeof copy>[0];
  return (
    <p
      aria-live="polite"
      className="admin-package-message"
      data-status={state.status}
      role={state.status === "error" ? "alert" : "status"}
    >
      {copy(messageKey)}
    </p>
  );
}

type LegalDocument = {
  title: string;
  intro: string;
  updated: string;
  sections: { title: string; paragraphs: string[] }[];
};

type LegalRow = {
  key: (typeof adminLegalKeys)[number];
  locale: string;
  document: LegalDocument | null;
};

export function LegalDocumentForm({ row }: { row: LegalRow }) {
  const copy = useTranslations("AdminContent");
  const [state, action, pending] = useActionState(
    saveLegalDocument,
    initialState,
  );
  const document = row.document;

  return (
    <form action={action} className="admin-package-form admin-content-form">
      <h3>{`${copy("legalTitle")} · ${localeLabel(copy, row.locale)}`}</h3>
      <input name="contentKey" type="hidden" value={row.key} />
      <input name="locale" type="hidden" value={row.locale} />
      {document ? (
        <div className="admin-package-fields">
          <label>
            {copy("titleLabel")}
            <input
              defaultValue={document.title}
              maxLength={300}
              name="title"
              required
            />
          </label>
          <label className="admin-package-field-wide">
            {copy("introLabel")}
            <textarea
              defaultValue={document.intro}
              maxLength={2000}
              name="intro"
              required
              rows={3}
            />
          </label>
          <label>
            {copy("updatedLabel")}
            <input
              defaultValue={document.updated}
              maxLength={120}
              name="updated"
              required
            />
          </label>
          <label className="admin-package-field-wide">
            {copy("sectionsLabel")}
            <textarea
              defaultValue={JSON.stringify(document.sections, null, 2)}
              name="sections"
              required
              rows={12}
              spellCheck={false}
            />
            <span className="admin-content-hint">{copy("sectionsHelp")}</span>
          </label>
        </div>
      ) : (
        <p className="admin-content-empty" role="status">
          {copy("noContent")}
        </p>
      )}
      {document ? (
        <div className="admin-package-submit">
          <button className="button button-dark" disabled={pending} type="submit">
            {pending ? copy("savingContent") : copy("saveContent")}
          </button>
          <ActionMessage state={state} />
        </div>
      ) : null}
    </form>
  );
}

type FaqRow = {
  id: string;
  locale: string;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
};

export function NewFaqEntryForm({ locale }: { locale: string }) {
  const copy = useTranslations("AdminContent");
  const [state, action, pending] = useActionState(saveFaqEntry, initialState);

  return (
    <form action={action} className="admin-package-form admin-content-form">
      <h3>{copy("newFaq")}</h3>
      <input name="faqId" type="hidden" value="" />
      <div className="admin-package-fields">
        <label>
          {copy("languages")}
          <select defaultValue={locale} name="locale">
            {adminContentLocales.map((entry) => (
              <option key={entry} value={entry}>
                {localeLabel(copy, entry)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy("orderLabel")}
          <input defaultValue={0} max={10000} min={0} name="sortOrder" type="number" />
        </label>
        <label className="admin-package-field-wide">
          {copy("questionLabel")}
          <input maxLength={400} name="question" required />
        </label>
        <label className="admin-package-field-wide">
          {copy("answerLabel")}
          <textarea maxLength={4000} name="answer" required rows={4} />
        </label>
        <label>
          {copy("publishedLabel")}
          <select defaultValue="true" name="isPublished">
            <option value="true">{copy("published")}</option>
            <option value="false">{copy("draft")}</option>
          </select>
        </label>
      </div>
      <div className="admin-package-submit">
        <button className="button button-dark" disabled={pending} type="submit">
          {pending ? copy("savingFaq") : copy("createFaq")}
        </button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function EditFaqEntryForm({ entry }: { entry: FaqRow }) {
  const copy = useTranslations("AdminContent");
  const [state, action, pending] = useActionState(saveFaqEntry, initialState);
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteFaqEntry,
    initialState,
  );

  return (
    <article className="admin-package-card">
      <form action={action} className="admin-package-form admin-content-form">
        <input name="faqId" type="hidden" value={entry.id} />
        <div className="admin-package-fields">
          <label>
            {copy("languages")}
            <select defaultValue={entry.locale} name="locale">
              {adminContentLocales.map((option) => (
                <option key={option} value={option}>
                  {localeLabel(copy, option)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {copy("orderLabel")}
            <input
              defaultValue={entry.sort_order}
              max={10000}
              min={0}
              name="sortOrder"
              type="number"
            />
          </label>
          <label className="admin-package-field-wide">
            {copy("questionLabel")}
            <input defaultValue={entry.question} maxLength={400} name="question" required />
          </label>
          <label className="admin-package-field-wide">
            {copy("answerLabel")}
            <textarea
              defaultValue={entry.answer}
              maxLength={4000}
              name="answer"
              required
              rows={4}
            />
          </label>
          <label>
            {copy("publishedLabel")}
            <select
              defaultValue={entry.is_published ? "true" : "false"}
              name="isPublished"
            >
              <option value="true">{copy("published")}</option>
              <option value="false">{copy("draft")}</option>
            </select>
          </label>
        </div>
        <div className="admin-package-submit">
          <button className="button button-dark" disabled={pending} type="submit">
            {pending ? copy("savingFaq") : copy("saveFaq")}
          </button>
          <ActionMessage state={state} />
        </div>
      </form>
      <form action={deleteAction} className="admin-content-delete">
        <input name="faqId" type="hidden" value={entry.id} />
        <button className="button button-ghost" disabled={deleting} type="submit">
          {deleting ? copy("deletingFaq") : copy("deleteFaq")}
        </button>
        <ActionMessage state={deleteState} />
      </form>
    </article>
  );
}

type PlanRow = {
  code: string;
  audience: string;
  name: string;
  blurb: string;
  features: string[];
  color: string;
  listing_count: number | null;
  price_1: number;
  price_7: number;
  price_30: number;
  is_active: boolean;
  sort_order: number;
};

export function EditListingPlanForm({ plan }: { plan: PlanRow }) {
  const copy = useTranslations("AdminContent");
  const [state, action, pending] = useActionState(saveListingPlan, initialState);

  return (
    <article className="admin-package-card">
      <header>
        <div>
          <span className="admin-package-code">{plan.code}</span>
          <h3>{plan.name}</h3>
        </div>
        <span className="admin-package-status" data-active={plan.is_active}>
          {plan.is_active ? copy("published") : copy("draft")}
        </span>
      </header>
      <form action={action} className="admin-package-form admin-content-form">
        <div className="admin-package-fields">
          <label>
            {copy("planCode")}
            <input
              autoComplete="off"
              defaultValue={plan.code}
              maxLength={80}
              name="code"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
          </label>
          <label>
            {copy("planName")}
            <input defaultValue={plan.name} maxLength={80} name="name" required />
          </label>
          <label>
            {copy("planAudience")}
            <input
              defaultValue={plan.audience}
              maxLength={40}
              name="audience"
              required
            />
          </label>
          <label>
            {copy("planListingCount")}
            <input
              defaultValue={plan.listing_count ?? ""}
              max={1000}
              min={1}
              name="listingCount"
              type="number"
            />
          </label>
          <label>
            {copy("planPrice1")}
            <input defaultValue={plan.price_1} min={0} name="price1" required type="number" />
          </label>
          <label>
            {copy("planPrice7")}
            <input defaultValue={plan.price_7} min={0} name="price7" required type="number" />
          </label>
          <label>
            {copy("planPrice30")}
            <input defaultValue={plan.price_30} min={0} name="price30" required type="number" />
          </label>
          <label className="admin-package-field-wide">
            {copy("planOrder")}
            <input
              defaultValue={plan.sort_order}
              max={10000}
              min={0}
              name="sortOrder"
              type="number"
            />
          </label>
          <label className="admin-package-field-wide">
            {copy("planVisibility")}
            <select defaultValue={plan.is_active ? "true" : "false"} name="isActive">
              <option value="true">{copy("published")}</option>
              <option value="false">{copy("draft")}</option>
            </select>
          </label>
          <input name="blurb" type="hidden" value={plan.blurb} />
          <input name="color" type="hidden" value={plan.color} />
          <input name="features" type="hidden" value={plan.features.join("\n")} />
        </div>
        <div className="admin-package-submit">
          <button className="button button-dark" disabled={pending} type="submit">
            {pending ? copy("savingPlan") : copy("savePlan")}
          </button>
          <ActionMessage state={state} />
        </div>
      </form>
    </article>
  );
}
