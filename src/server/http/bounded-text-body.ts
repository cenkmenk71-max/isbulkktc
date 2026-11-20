/**
 * Read a text request body without allowing an unbounded allocation.
 *
 * Content-Length is only an early-rejection hint; the stream byte count is the
 * authoritative limit because the header can be absent or untrusted.
 */
export type BoundedTextBodyResult =
  | { ok: true; text: string }
  | {
      ok: false;
      reason: "too_large" | "invalid_length" | "invalid_utf8" | "read_failed";
    };

export async function readBoundedTextBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedTextBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      return { ok: false, reason: "invalid_length" };
    }
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length)) {
      return { ok: false, reason: "invalid_length" };
    }
    if (length > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: true, text: "" };

  const buffer = new Uint8Array(maxBytes);
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value.byteLength > maxBytes - totalBytes) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation is best-effort; the size limit has already been hit.
        }
        return { ok: false, reason: "too_large" };
      }

      buffer.set(value, totalBytes);
      totalBytes += value.byteLength;
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // The request stream has already failed.
    }
    return { ok: false, reason: "read_failed" };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A cancelled/errored reader can already have released its lock.
    }
  }

  try {
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(
        buffer.subarray(0, totalBytes),
      ),
    };
  } catch {
    return { ok: false, reason: "invalid_utf8" };
  }
}
