"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getCurrentUser } from "@/server/dal/user";
import { CONTENT_TAGS } from "@/server/dal/content";
import { getLocalePrefix } from "@/i18n/routing";
import {
  faqDeleteFormSchema,
  faqEntryFormSchema,
  legalDocumentFormSchema,
  listingPlanFormSchema,
  parseFeatureList,
  parseLegalSections,
  type AdminContentActionState,
} from "./admin-content-schemas";

const initialState: AdminContentActionState = {
  status: "idle",
  message: "idle",
};

function unauthorized(): AdminContentActionState {
  return { ...initialState, status: "error", message: "unauthorized" };
}

/**
 * Drops the managed-content cache so the next request reads Postgres again.
 * `unstable_cache` persists across restarts and only `revalidateTag` clears it,
 * so a write that skips this call would keep serving the previous values for up
 * to `CONTENT_REVALIDATE_SECONDS`.
 */
function invalidateContent(tags: readonly string[]) {
  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }
}

export async function saveLegalDocument(
  _previousState: AdminContentActionState,
  formData: FormData,
): Promise<AdminContentActionState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return unauthorized();

  const result = legalDocumentFormSchema.safeParse({
    contentKey: formData.get("contentKey"),
    locale: formData.get("locale"),
    document: {
      title: formData.get("title"),
      intro: formData.get("intro"),
      updated: formData.get("updated"),
      sections: parseLegalSections(formData.get("sections")),
    },
  });
  if (!result.success) {
    return { ...initialState, status: "error", message: "invalid" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_upsert_site_content", {
    _content_key: `legal.${result.data.contentKey}`,
    _locale: result.data.locale,
    _document: result.data.document,
  });
  if (error) {
    if (error.code === "42501") return unauthorized();
    if (error.code === "22023" || error.code === "23514") {
      return { ...initialState, status: "error", message: "invalid" };
    }
    console.error("Legal document save failed.", { code: error.code });
    return { ...initialState, status: "error", message: "saveFailed" };
  }

  invalidateContent([CONTENT_TAGS.legal]);
  const prefix = getLocalePrefix(user.locale);
  revalidatePath(`${prefix}/privacy`);
  revalidatePath(`${prefix}/cookies`);
  revalidatePath(`${prefix}/terms`);
  return { status: "success", message: "saved" };
}

export async function saveFaqEntry(
  _previousState: AdminContentActionState,
  formData: FormData,
): Promise<AdminContentActionState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return unauthorized();

  const published = formData.get("isPublished");
  if (published !== "true" && published !== "false") {
    return { ...initialState, status: "error", message: "invalid" };
  }

  const result = faqEntryFormSchema.safeParse({
    faqId: formData.get("faqId") || null,
    locale: formData.get("locale"),
    question: formData.get("question"),
    answer: formData.get("answer"),
    sortOrder: formData.get("sortOrder"),
    isPublished: published === "true",
  });
  if (!result.success) {
    return { ...initialState, status: "error", message: "invalid" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_upsert_faq_entry", {
    _id: result.data.faqId,
    _locale: result.data.locale,
    _question: result.data.question,
    _answer: result.data.answer,
    _sort_order: result.data.sortOrder,
    _is_published: result.data.isPublished,
  });
  if (error) {
    if (error.code === "42501") return unauthorized();
    if (error.code === "22023" || error.code === "23514") {
      return { ...initialState, status: "error", message: "invalid" };
    }
    console.error("FAQ entry save failed.", { code: error.code });
    return { ...initialState, status: "error", message: "saveFailed" };
  }

  invalidateContent([CONTENT_TAGS.faq]);
  const prefix = getLocalePrefix(user.locale);
  revalidatePath(`${prefix}/admin/content`);
  revalidatePath(`${prefix}/about`);
  return { status: "success", message: "saved" };
}

export async function deleteFaqEntry(
  _previousState: AdminContentActionState,
  formData: FormData,
): Promise<AdminContentActionState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return unauthorized();

  const result = faqDeleteFormSchema.safeParse({ faqId: formData.get("faqId") });
  if (!result.success) {
    return { ...initialState, status: "error", message: "invalid" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_delete_faq_entry", {
    _id: result.data.faqId,
  });
  if (error) {
    if (error.code === "42501") return unauthorized();
    if (error.code === "P0002") {
      return { ...initialState, status: "error", message: "invalid" };
    }
    console.error("FAQ entry delete failed.", { code: error.code });
    return { ...initialState, status: "error", message: "deleteFailed" };
  }

  invalidateContent([CONTENT_TAGS.faq]);
  const prefix = getLocalePrefix(user.locale);
  revalidatePath(`${prefix}/admin/content`);
  revalidatePath(`${prefix}/about`);
  return { status: "success", message: "deleted" };
}

export async function saveListingPlan(
  _previousState: AdminContentActionState,
  formData: FormData,
): Promise<AdminContentActionState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return unauthorized();

  const active = formData.get("isActive");
  if (active !== "true" && active !== "false") {
    return { ...initialState, status: "error", message: "invalid" };
  }
  const listingCount = formData.get("listingCount");
  const blankListingCount =
    typeof listingCount !== "string" || listingCount.trim().length === 0;

  const result = listingPlanFormSchema.safeParse({
    code: formData.get("code"),
    audience: formData.get("audience"),
    name: formData.get("name"),
    blurb: formData.get("blurb") ?? "",
    features: parseFeatureList(formData.get("features")),
    color: formData.get("color"),
    listingCount: blankListingCount ? null : listingCount,
    price1: formData.get("price1"),
    price7: formData.get("price7"),
    price30: formData.get("price30"),
    isActive: active === "true",
    sortOrder: formData.get("sortOrder"),
  });
  if (!result.success) {
    return { ...initialState, status: "error", message: "invalid" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_upsert_listing_plan", {
    _code: result.data.code,
    _audience: result.data.audience,
    _name: result.data.name,
    _blurb: result.data.blurb,
    _features: result.data.features,
    _color: result.data.color,
    _listing_count: result.data.listingCount,
    _price_1: result.data.price1,
    _price_7: result.data.price7,
    _price_30: result.data.price30,
    _is_active: result.data.isActive,
    _sort_order: result.data.sortOrder,
  });
  if (error) {
    if (error.code === "42501") return unauthorized();
    if (error.code === "22023" || error.code === "23514") {
      return { ...initialState, status: "error", message: "invalid" };
    }
    console.error("Listing plan save failed.", { code: error.code });
    return { ...initialState, status: "error", message: "saveFailed" };
  }

  invalidateContent([CONTENT_TAGS.plans]);
  const prefix = getLocalePrefix(user.locale);
  revalidatePath(`${prefix}/admin/content`);
  revalidatePath(`${prefix}/packages`);
  return { status: "success", message: "saved" };
}
