export function isCorruptedSupabaseAuthError(error: unknown): boolean {
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === null || current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (current instanceof Error) {
      const message = current.message;
      if (
        /Unexpected non-whitespace character after JSON|chunked cookie decoded to invalid JSON|invalid JSON|failed to parse JSON|JSON\.parse/i.test(
          message,
        )
      ) {
        return true;
      }
    }

    if (typeof current === "string") {
      if (
        /Unexpected non-whitespace character after JSON|chunked cookie decoded to invalid JSON|invalid JSON|failed to parse JSON|JSON\.parse/i.test(
          current,
        )
      ) {
        return true;
      }
    }

    if (typeof current === "object") {
      const object = current as {
        cause?: unknown;
        error?: unknown;
      };

      if (object.cause !== undefined) {
        queue.push(object.cause);
      }
      if (object.error !== undefined) {
        queue.push(object.error);
      }
    }
  }

  return false;
}
