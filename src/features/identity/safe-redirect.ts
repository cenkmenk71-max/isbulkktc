/**
 * Guards against open-redirect abuse in the auth callback.
 *
 * `next` is attacker-controllable (it is copied straight from the request
 * query), so it is never used as a raw redirect target. It is treated as an
 * opaque *key* that is mapped to a fixed, same-origin path. The callback also
 * builds every destination from `new URL(path, getAppBaseUrl())`, which drops
 * an absolute URL supplied here, but keeping a closed allow-list means a future
 * refactor cannot quietly turn this into a phishing vector.
 */
const postAuthDestinationByKey = {
  candidate: "/profile/dashboard",
  company: "/company/dashboard",
} as const;

export type PostAuthDestinationKey = keyof typeof postAuthDestinationByKey;

export const defaultPostAuthDestinationKey: PostAuthDestinationKey = "candidate";

export function toPostAuthDestinationKey(
  value: string | null | undefined,
): PostAuthDestinationKey {
  return value !== null &&
    value !== undefined &&
    Object.prototype.hasOwnProperty.call(postAuthDestinationByKey, value)
    ? (value as PostAuthDestinationKey)
    : defaultPostAuthDestinationKey;
}

export function getPostAuthDestinationPath(key: PostAuthDestinationKey): string {
  return postAuthDestinationByKey[key];
}
