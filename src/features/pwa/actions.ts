"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { isPushConfigured } from "@/server/push/vapid";

/**
 * Server actions for push subscription management.
 *
 * Every action runs as the signed-in user, and the RPCs behind them bind the row
 * to `auth.uid()`. The action never accepts a user id from the caller, so there
 * is no path to write a subscription onto someone else's account.
 *
 * The subscription payload is validated here as well as in the database: the
 * endpoint and keys are capability tokens, so a malformed one must be rejected
 * before it can be stored and later fail at send time.
 */

const subscriptionSchema = z.object({
  endpoint: z.string().url().min(12).max(1024).startsWith("https://"),
  keys: z.object({
    p256dh: z.string().min(16).max(256),
    auth: z.string().min(8).max(128),
  }),
});

export type SavePushSubscriptionResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "invalid" | "not_configured" | "error" };

export async function savePushSubscription(
  payload: unknown,
): Promise<SavePushSubscriptionResult> {
  const parsed = subscriptionSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  // Device metadata is taken from the request, never from the caller, so a
  // client cannot forge the string the account's device list shows.
  const userAgent = (await headers()).get("user-agent");

  const { error } = await supabase.rpc("register_push_subscription", {
    _endpoint: parsed.data.endpoint,
    _p256dh: parsed.data.keys.p256dh,
    _auth_key: parsed.data.keys.auth,
    _user_agent: userAgent ? userAgent.slice(0, 300) : null,
  });

  if (error) return { ok: false, reason: "error" };
  return { ok: true };
}

export type RemovePushSubscriptionResult = { ok: true } | { ok: false };

export async function removePushSubscription(
  endpoint: string | null,
): Promise<RemovePushSubscriptionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase.rpc("revoke_push_subscription", {
    _endpoint: typeof endpoint === "string" ? endpoint.slice(0, 1024) : null,
  });

  return error ? { ok: false } : { ok: true };
}

export type PushPreferences = {
  applicationUpdates: boolean;
  jobAlerts: boolean;
  employerApplications: boolean;
  messages: boolean;
  marketing: boolean;
};

export type PushPreferenceState = {
  permission: "default" | "granted" | "denied" | "unsupported";
  subscribed: boolean;
  preferences: PushPreferences | null;
  supported: boolean;
  /**
   * Whether a session exists. A subscription row is bound to `auth.uid()`, so an
   * anonymous visitor cannot store one; the control uses this to ask for a
   * sign-in instead of triggering a browser permission prompt whose grant could
   * never be saved (and which iOS only offers once).
   */
  authenticated: boolean;
};

const preferenceSchema = z.object({
  applicationUpdates: z.boolean(),
  jobAlerts: z.boolean(),
  employerApplications: z.boolean(),
  messages: z.boolean(),
  marketing: z.boolean(),
});

export type SavePreferencesResult = { ok: true } | { ok: false };

export async function savePushPreferences(
  payload: PushPreferences,
): Promise<SavePreferencesResult> {
  const parsed = preferenceSchema.safeParse(payload);
  if (!parsed.success) return { ok: false };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase.rpc("set_push_notification_preferences", {
    _application_updates: parsed.data.applicationUpdates,
    _job_alerts: parsed.data.jobAlerts,
    _employer_applications: parsed.data.employerApplications,
    _messages: parsed.data.messages,
    _marketing: parsed.data.marketing,
  });

  return error ? { ok: false } : { ok: true };
}

/**
 * Server-side state for the notification control. The browser's own
 * `Notification.permission` and `pushManager.getSubscription()` are read on the
 * client; this supplies only what the server knows (subscription rows and saved
 * preferences) plus whether push is configured at all.
 */
export async function getPushPreferenceState(): Promise<PushPreferenceState> {
  if (!isPushConfigured()) {
    return {
      permission: "unsupported",
      subscribed: false,
      preferences: null,
      supported: false,
      authenticated: false,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      permission: "default",
      subscribed: false,
      preferences: null,
      supported: true,
      authenticated: false,
    };
  }

  const [subscriptions, preferences] = await Promise.all([
    supabase.rpc("list_my_push_subscriptions"),
    supabase.rpc("get_my_push_preferences"),
  ]);

  const row = Array.isArray(preferences.data) ? preferences.data[0] : preferences.data;

  return {
    permission: "default",
    subscribed: Array.isArray(subscriptions.data) && subscriptions.data.length > 0,
    preferences: row
      ? {
          applicationUpdates: Boolean(row.application_updates),
          jobAlerts: Boolean(row.job_alerts),
          employerApplications: Boolean(row.employer_applications),
          messages: Boolean(row.messages),
          marketing: Boolean(row.marketing),
        }
      : null,
    supported: true,
    authenticated: true,
  };
}
