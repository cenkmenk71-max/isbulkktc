/**
 * Validation for the `next` parameter the QR install route accepts.
 *
 * The install route is the one place a visitor can be sent somewhere else by a
 * URL that a third party controls (the QR code is printed on a poster, so it is
 * effectively attacker-influenced input). Everything here exists to keep the
 * continuation destination inside this origin.
 *
 * Rejected on purpose:
 *  - absolute URLs (`https://evil.example`) and protocol-relative ones
 *    (`//evil.example`), which browsers treat as a host change;
 *  - any backslash, because the URL parser normalises `\` to `/`, so `/\evil.example`
 *    resolves to a *different host* even though it starts with a single slash;
 *  - control characters, which can be used to smuggle a scheme past a naive check;
 *  - non-HTTP schemes (`javascript:`, `data:`, `blob:`, `file:`), including the
 *    case where they appear after the leading slash;
 *  - the install route itself, which would loop.
 *
 * The return value is always the normalised path + query + hash, never the raw
 * input, so a caller cannot accidentally render the original string.
 */

const maxNextPathLength = 2048;
const forbiddenScheme = /^[a-z][a-z0-9+.-]*:/i;
const controlCharacters = /[\u0000-\u001f\u007f]/;

export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  const value = raw.trim();
  if (value.length === 0 || value.length > maxNextPathLength) return null;

  // A same-origin path is exactly a string that starts with one slash. Two
  // slashes is protocol-relative, and a leading backslash is normalised to a
  // slash by the URL parser, so both are host changes in disguise.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  if (value.includes("\\")) return null;
  if (controlCharacters.test(value)) return null;
  if (forbiddenScheme.test(value.slice(1))) return null;

  let resolved: URL;
  try {
    resolved = new URL(value, "https://next-path.invalid");
  } catch {
    return null;
  }

  // `new URL` is the authority on whether the string stayed on the placeholder
  // origin; if it did not, some normalisation form we did not anticipate moved
  // the host.
  if (resolved.origin !== "https://next-path.invalid") return null;
  if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return null;
  // The install route (in any locale) and the non-page handlers would loop or
  // land on a raw response, so they are not valid continuation targets.
  if (resolved.pathname === "/install" || resolved.pathname.endsWith("/install")) {
    return null;
  }
  if (resolved.pathname.startsWith("/api/") || resolved.pathname.startsWith("/auth/")) {
    return null;
  }

  const normalized = `${resolved.pathname}${resolved.search}${resolved.hash}`;

  // Re-validate the *output*, not just the input. The checks above run on the
  // raw string, but `new URL` resolves `..`/`.` segments first, so a path that
  // hides a second slash behind a dot segment normalises back into a
  // protocol-relative URL: `sanitizeNextPath("/..//host")` used to return
  // `"//host"`, which a browser resolves off-origin. The origin check on
  // `resolved` cannot catch it — the origin is always the base's.
  if (
    normalized.startsWith("//") ||
    normalized.includes("\\") ||
    forbiddenScheme.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

/**
 * The destination a visitor should continue to when no (valid) `next` was
 * supplied. Public and in-scope, so a home-screen launch always lands on real
 * content even when the QR carried nothing.
 */
export const defaultInstallDestination = "/jobs";
