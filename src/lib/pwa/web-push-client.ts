/**
 * Converts the VAPID public key into the `applicationServerKey` the Push API
 * expects.
 *
 * The Push API wants a `BufferSource` holding the raw uncompressed point, while
 * the key is served as base64url (the URL-safe alphabet, padding optional). The
 * three normalisations below are each required by at least one browser:
 * `-`/`_` must be mapped back to `+`/`/`, padding must be restored before
 * `atob`, and `atob` returns a binary string that has to be widened to bytes.
 *
 * Throws on an empty or malformed key so a misconfigured deployment fails at the
 * point of subscription rather than producing a silently unusable subscription.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const normalized = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : normalized + "=".repeat(4 - padding);

  const binary = atob(padded);
  // Backed by a plain `ArrayBuffer` (not `ArrayBufferLike`): `PushManager.subscribe`
  // takes a `BufferSource`, whose view must not be backed by a `SharedArrayBuffer`.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error("The VAPID public key is not an uncompressed P-256 point.");
  }
  return bytes;
}
