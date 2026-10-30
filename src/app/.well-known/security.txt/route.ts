import { getAppBaseUrl } from "@/server/config/app-url";

export const dynamic = "force-static";
export const revalidate = 86400;

/**
 * RFC 9116 security.txt, served at /.well-known/security.txt. `revalidate`
 * recomputes the required `Expires` field daily so it never lapses.
 */
export function GET() {
  const origin = getAppBaseUrl().origin;
  const expires = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);

  const body = [
    "Contact: mailto:info@isbulkktc.com",
    `Expires: ${expires.toISOString()}`,
    `Canonical: ${origin}/.well-known/security.txt`,
    "Preferred-Languages: tr, en",
  ].join("\n");

  return new Response(`${body}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
