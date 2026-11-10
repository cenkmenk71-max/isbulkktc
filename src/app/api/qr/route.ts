import QRCode from "qrcode";
import { getAppBaseUrl } from "@/server/config/app-url";
import {
  buildInstallQrUrl,
  buildQrRenderOptions,
  type QrRenderOptions,
} from "@/lib/pwa/qr";

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

/**
 * Serialises the payload, returning `null` when it does not fit in any symbol.
 *
 * A caller can pin a `version` too small for the payload — `buildQrRenderOptions`
 * accepts the full 1..40 range, but the default `/install?next=/jobs` payload
 * needs version 3 — and `QRCode` throws on that. Dropping the pin lets the
 * generator auto-size, which is the same fallback an out-of-range version gets,
 * so a poster with a too-small `version` still prints a scannable symbol instead
 * of a 500. If even auto-sizing throws, the payload is past version 40's
 * capacity (a byte-heavy `next` the 2048-*character* cap lets through) and no
 * symbol can hold it, so the caller gets a controlled 4xx.
 */
async function render(
  body: string,
  options: QrRenderOptions,
  format: Format,
): Promise<{ svg: string } | { png: Uint8Array<ArrayBuffer> } | null> {
  const attempt = async (renderOptions: QrRenderOptions) =>
    format === "png"
      ? { png: new Uint8Array(await QRCode.toBuffer(body, { ...renderOptions, type: "png", width: 1024 })) }
      : { svg: await QRCode.toString(body, { ...renderOptions, type: "svg" }) };

  try {
    return await attempt(options);
  } catch {
    if (options.version === undefined) return null;
    try {
      return await attempt({ ...options, version: undefined });
    } catch {
      return null;
    }
  }
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

  const rendered = await render(body, options, format);
  if (!rendered) {
    return new Response("The requested QR payload is too large to encode.", {
      status: 414,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if ("png" in rendered) {
    return new Response(rendered.png, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="isbulkktc-install-qr.png"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return new Response(rendered.svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
