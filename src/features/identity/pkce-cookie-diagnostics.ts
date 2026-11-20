/**
 * Inspects cookie *names* only. PKCE verifier values are secrets and must never
 * be copied into application logs or diagnostics.
 */
function hasCookieValueOrChunk(
  cookieNames: readonly string[],
  baseName: string,
): boolean {
  return cookieNames.some((name) => {
    if (name === baseName) return true;
    if (!name.startsWith(`${baseName}.`)) return false;
    return /^\d+$/.test(name.slice(baseName.length + 1));
  });
}

export function inspectPkceVerifierCookies(
  cookieNames: readonly string[],
  storageKey: string,
  flowId: string | undefined,
): {
  hasFlowVerifierCookie: boolean | null;
  hasLegacyVerifierCookie: boolean;
} {
  return {
    hasFlowVerifierCookie: flowId
      ? hasCookieValueOrChunk(
          cookieNames,
          `${storageKey}-flow-${flowId}-code-verifier`,
        )
      : null,
    hasLegacyVerifierCookie: hasCookieValueOrChunk(
      cookieNames,
      `${storageKey}-code-verifier`,
    ),
  };
}
