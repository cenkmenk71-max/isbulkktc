import QRCode from "qrcode";
import { getAppBaseUrl } from "@/server/config/app-url";
import { buildInstallQrUrl, buildQrRenderOptions } from "@/lib/pwa/qr";

/**
 * QR code generator for the install entry point.
 *
 * Deliberately a route rather than a build step: a campaign QR has to be
 * reprintable without a deploy, and the only thing it needs is the origin. The
 * payload is built by `buildInstallQrUrl`, which runs the same validators the
 * install page uses, so a code this route emits can never contain a destination
 * the page would refuse.
 *
 * What it will not do:
 *  - encode an absolute URL other than this origin's install route,
 *  - accept an unvalidated `next` (see `sanitizeNextPath`),
 *  - embed a session, token or any personal data — the URL is a public poster.
 */
export const dynamic = "force-dynamic";

type Format = "svg" | "png";

function parseFormat(raw: string | null): Format {
  return raw === "png" ? "png" : "svg";
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const format = parseFormat(url.searchParams.get("format"));
  const body = buildInstallQrUrl({
    origin: getAppBaseUrl().origin,
    searchParams: url.searchParams,
  });

  const versionRaw = Number.parseInt(url.searchParams.get("version") ?? "", 10);
  const options = buildQrRenderOptions({
    requestedVersion: Number.isNaN(versionRaw) ? null : versionRaw,
  });

  if (format === "png") {
    const png = await QRCode.toBuffer(body, { ...options, type: "png", width: 1024 });
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="isbulkktc-install-qr.png"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const svg = await QRCode.toString(body, { ...options, type: "svg" });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
