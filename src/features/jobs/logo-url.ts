const employerLogoUrlPatterns = [
  {
    hostname: "api.isbulkibris.com",
    pathname:
      /^\/api\/employer\/logo\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  },
  {
    hostname: "innovia-iskibris.s3.eu-west-2.amazonaws.com",
    pathname: /^\/[0-9]+_[0-9a-f]+(?:-thumb@\d+)?\.(?:png|jpg|webp)$/i,
  },
] as const;

export function isSupportedEmployerLogoUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.search &&
      !url.hash &&
      employerLogoUrlPatterns.some(
        (pattern) =>
          url.hostname === pattern.hostname && pattern.pathname.test(url.pathname),
      )
    );
  } catch {
    return false;
  }
}
