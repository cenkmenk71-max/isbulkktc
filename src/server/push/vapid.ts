import "server-only";

import webpush, { type PushSubscription as WebPushSubscription } from "web-push";

/**
 * VAPID configuration for Web Push.
 *
 * The key pair is generated once per deployment and stored in the environment:
 *
 *   npx web-push generate-vapid-keys --json
 *
 * `VAPID_PUBLIC_KEY` is served to the browser (it is not a secret — it is the
 * server's identity to the push service). `VAPID_PRIVATE_KEY` signs the request
 * and must never leave the server: with it plus the public key, anyone could
 * deliver notifications as this application. Nothing here reads it into a client
 * component, and this module is `server-only`.
 *
 * A missing or malformed pair disables push cleanly rather than throwing at
 * import time: the install page shows "notifications are unavailable on this
 * deployment" and the rest of the app is unaffected.
 */

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

// `web-push` accepts a VAPID public key as an uncompressed P-256 point, which is
// 65 bytes: 0x04 followed by two 32-byte coordinates, base64url without padding.
const uncompressedPointPattern = /^[A-Za-z0-9_-]{87}$/;
const privateKeyPattern = /^[A-Za-z0-9_-]{43}$/;

function readVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) return null;
  if (!uncompressedPointPattern.test(publicKey)) return null;
  if (!privateKeyPattern.test(privateKey)) return null;
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) return null;

  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return readVapidConfig() !== null;
}

/**
 * The public key for the client, or null when push is not configured. Safe to
 * pass across the server/client boundary — it carries no secret.
 */
export function getVapidPublicKey(): string | null {
  return readVapidConfig()?.publicKey ?? null;
}

let configured = false;

function ensureConfigured(): VapidConfig | null {
  const config = readVapidConfig();
  if (!config) return null;
  if (!configured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configured = true;
  }
  return config;
}

export type PushSendResult =
  | { status: "delivered"; statusCode: number }
  | { status: "gone"; statusCode: number }
  | { status: "failed"; statusCode: number; retryable: boolean }
  | { status: "not_configured" };

export type PushTarget = {
  subscriptionId: string;
  endpoint: string;
  p256dh: string;
  authKey: string;
};

/**
 * Sends one push message.
 *
 * The failure classification matters more than the send: a 404/410 means the
 * browser subscription is permanently gone and must be revoked, while a 429 or
 * 5xx is transient and should be retried. Collapsing them into "failed" is how a
 * dead endpoint gets retried forever and a live one gets thrown away.
 */
export async function sendPushMessage(
  target: PushTarget,
  payload: string,
): Promise<PushSendResult> {
  if (!ensureConfigured()) return { status: "not_configured" };

  const subscription: WebPushSubscription = {
    endpoint: target.endpoint,
    keys: { p256dh: target.p256dh, auth: target.authKey },
  };

  try {
    const response = await webpush.sendNotification(subscription, payload, {
      TTL: 60 * 60 * 24,
      timeout: 10_000,
    });
    return { status: "delivered", statusCode: response.statusCode };
  } catch (error) {
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 0;

    if (statusCode === 404 || statusCode === 410) {
      return { status: "gone", statusCode };
    }
    return {
      status: "failed",
      statusCode,
      retryable: statusCode === 0 || statusCode === 429 || statusCode >= 500,
    };
  }
}
