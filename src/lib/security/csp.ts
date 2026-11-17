const trustedScriptHosts = [
  "https://challenges.cloudflare.com",
  "https://*.challenges.cloudflare.com",
  "https://static.cloudflareinsights.com",
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
] as const;

export function getScriptSrc(isDevelopment: boolean): string {
  return [
    "'self'",
    "'unsafe-inline'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ...trustedScriptHosts,
  ].join(" ");
}
