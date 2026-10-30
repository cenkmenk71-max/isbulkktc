"use server";

import { getCurrentUser } from "@/server/dal/user";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import {
  resolveHeaderDashboardHref,
  type HeaderSessionState,
} from "./header-session";

/**
 * Session state for the global header.
 *
 * A server action (not a layout read) so the statically prerendered public
 * routes keep their static shell: the layout never calls `cookies()`, and the
 * header hydrates the signed-in variant on the client. Fails closed — any
 * lookup problem reports the signed-out state rather than a broken header.
 */
export async function getHeaderSession(): Promise<HeaderSessionState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return { signedIn: false };

  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("company_members")
    .select("company_id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("membership_role", "owner")
    .eq("status", "active");

  if (error) {
    console.warn("The header employer membership lookup failed.", {
      code: error.code,
    });
  }

  return {
    signedIn: true,
    displayName: user.displayName,
    dashboardHref: resolveHeaderDashboardHref((count ?? 0) > 0),
  };
}
