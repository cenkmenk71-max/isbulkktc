import "server-only";

export function getAppBaseUrl(): URL {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!configuredUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL must be configured for secure auth callbacks.");
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
