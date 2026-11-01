import "server-only";

export function getAppBaseUrl(): URL {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;

  // In production a missing origin would silently emit `localhost` canonical
  // URLs, sitemap entries and auth callbacks — a break that is invisible until
  // it is indexed. Fail loudly instead. Development and test keep the loopback
  // default so the suite runs without a configured origin.
  if (!configuredUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXT_PUBLIC_APP_URL (or APP_URL) must be configured in production.",
      );
    }
    return new URL("http://localhost:3000");
  }

  const appUrl = new URL(configuredUrl);
  const isLoopbackHost = ["localhost", "127.0.0.1", "[::1]"].includes(
    appUrl.hostname,
  );

  if (
    (appUrl.protocol !== "https:" && !(appUrl.protocol === "http:" && isLoopbackHost)) ||
    appUrl.username ||
    appUrl.password ||
    appUrl.pathname !== "/" ||
    appUrl.search ||
    appUrl.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be an HTTPS origin (HTTP is allowed only for localhost).",
    );
  }

  return appUrl;
}
