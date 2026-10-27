import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Collects company logos into public/logos and records them in
 * src/features/companies/data/company-logos.json.
 *
 * Sources, in priority order:
 *   0. a domain from company-logo-domains.json (researched by hand) when the
 *      directory website is missing, dead or blocking automated reads
 *   1. apple-touch-icon / logo hinted images from the company website
 *   2. og:image, only when it is roughly square
 *   3. logo assets referenced from CSS backgrounds, inline SVG or schema.org
 *      markup, for themes that never use a plain <img> for the brand
 *   4. the conventional logo paths (e.g. /logo.svg, /apple-touch-icon.png)
 *   5. the site favicon (via Google's 256px favicon endpoint as a last resort)
 *   6. the brand avatar of a linked Facebook, X/Twitter, Linktree or Google
 *      Sites profile, for companies that never bought a domain
 *
 * Instagram is deliberately not consulted: its profile pages are login-walled
 * and its avatar endpoints answer 403/429 from a server environment.
 *
 * Companies with no website and no social profile cannot be resolved without a
 * search API (see --discover on BRAVE_SEARCH_API_KEY) and keep the monogram.
 *
 * Usage:
 *   npm run logos:fetch                       # all companies with a domain
 *   npm run logos:fetch -- --limit=25         # sample run
 *   npm run logos:fetch -- --only=<companyId> # single company
 *   npm run logos:fetch -- --force            # refetch existing entries
 *   npm run logos:fetch -- --discover         # also search for missing domains
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const directoryPath = path.join(
  projectRoot,
  "src",
  "features",
  "companies",
  "data",
  "company-directory.json",
);
const manifestPath = path.join(
  projectRoot,
  "src",
  "features",
  "companies",
  "data",
  "company-logos.json",
);
// Directory websites are wrong or dead for many entries. This file carries the
// official domains that were confirmed by hand for those, keyed by company id.
const hintDomainsPath = path.join(
  projectRoot,
  "src",
  "features",
  "companies",
  "data",
  "company-logo-domains.json",
);
const outputDirectory = path.join(projectRoot, "public", "logos");

const logoSize = 256;
const requestTimeoutMs = 15000;
const hostDelayMs = 350;
const maxHtmlBytes = 900_000;
const minLogoEdge = 48;
// Anything above this ratio is a site banner or a screenshot, not a logo: it
// would collapse to a hairline inside a square tile.
const maxAspectRatio = 6;
// Margin (in pixels of tolerance from the corner colour) removed around the
// logo. Storing the untrimmed square is what used to make 150 of 270 logos
// render at 15-55% of their tile, so the crop happens before the resize.
const trimTolerance = 10;
const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

// Social networks, marketplaces and map/booking pages are not the company's own
// site: a logo lookup keyed by their host would return the platform brand.
const platformHosts = new Set([
  "x.com",
  "twitter.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "pinterest.com",
  "wa.me",
  "whatsapp.com",
  "linktr.ee",
  "t.me",
  "google.com",
  "goo.gl",
  "maps.app.goo.gl",
  "tripadvisor.com",
  "booking.com",
  "airbnb.com",
  "yelp.com",
  "sahibinden.com",
  "yandex.com",
  "yandex.ru",
]);

// unavatar answers with its own generic logo when a handle is unknown. It is
// downloaded once per run and compared byte for byte so it never ends up stored
// as a company logo. Facebook needs no equivalent here: the Graph API reports
// `is_silhouette` for accounts that have no picture.
const unavatarFallbackUrl = "https://unavatar.io/fallback";
const socialPlaceholders = [];
// Below this size a response is a placeholder marker rather than artwork.
const minSocialBytes = 800;

// Logo artwork that page builders drop at a hard-coded path instead of
// declaring it in the markup. Probed on the company's own domain, so any hit
// belongs to that company.
const logoProbePaths = [
  "/logo.svg",
  "/logo.png",
  "/images/logo.svg",
  "/images/logo.png",
  "/img/logo.svg",
  "/img/logo.png",
  "/assets/logo.svg",
  "/assets/logo.png",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
];

// Network errors that mean the host itself is unreachable. Once one of these is
// seen, every further request to the same host fails the same way, so the run
// stops retrying it instead of paying a timeout per URL.
const unreachableCodes = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const options = {
  limit: Number.POSITIVE_INFINITY,
  concurrency: 6,
  force: false,
  only: null,
  discover: false,
  dryRun: false,
  hinted: false,
  sitesOnly: false,
};

for (const argument of process.argv.slice(2)) {
  if (argument === "--force") options.force = true;
  else if (argument === "--discover") options.discover = true;
  else if (argument === "--dry-run") options.dryRun = true;
  else if (argument === "--hinted") options.hinted = true;
  else if (argument === "--sites-only") options.sitesOnly = true;
  else if (argument.startsWith("--limit="))
    options.limit = Number(argument.slice(8));
  else if (argument.startsWith("--concurrency="))
    options.concurrency = Math.max(1, Number(argument.slice(14)));
  else if (argument.startsWith("--only=")) options.only = argument.slice(7);
  else throw new Error(`Unknown argument: ${argument}`);
}

const hostQueues = new Map();

function waitForHost(host, minimumDelayMs) {
  const previous = hostQueues.get(host) ?? Promise.resolve();
  const next = previous.then(
    () => new Promise((resolve) => setTimeout(resolve, minimumDelayMs)),
  );
  hostQueues.set(host, next);
  return previous;
}

async function fetchWithTimeout(url, { accept = "*/*", asText = false } = {}) {
  const { host } = new URL(url);
  await waitForHost(host, hostDelayMs);

  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      "user-agent": userAgent,
      accept,
      "accept-language": "tr,en;q=0.8",
      "cache-control": "no-cache",
    },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  if (asText) {
    const body = await response.text();
    return {
      body: body.slice(0, maxHtmlBytes),
      contentType: response.headers.get("content-type") ?? "",
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error("empty body");
  return {
    body: buffer,
    contentType: response.headers.get("content-type") ?? "",
  };
}

function resolveAssetUrl(value, baseUrl) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith("javascript:")) return null;
  if (trimmed.startsWith("data:")) return trimmed;

  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

function largestFromSrcset(srcset) {
  if (!srcset) return null;

  const entries = srcset
    .split(",")
    .map((entry) => entry.trim().split(/\s+/))
    .filter((parts) => parts[0])
    .map(([url, descriptor]) => [
      url,
      Number.parseFloat(descriptor ?? "0") || 0,
    ]);

  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function extractLogoCandidates(html, baseUrl) {
  const candidates = new Map();

  const add = (value, source, weight) => {
    const url = resolveAssetUrl(value, baseUrl);
    if (!url) return;
    const current = candidates.get(url);
    if (!current || current.weight < weight)
      candidates.set(url, { url, source, weight });
  };

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel =
      tag.match(/rel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
    if (!rel) continue;

    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;

    const sizes = tag.match(/sizes\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    const declaredSize = Math.max(
      0,
      ...[...sizes.matchAll(/(\d+)\s*x\s*(\d+)/gi)].map((size) =>
        Number(size[1]),
      ),
    );

    if (rel.includes("apple-touch-icon")) {
      add(href, "apple-touch-icon", 60 + Math.min(declaredSize / 4, 20));
    } else if (rel.split(/\s+/).includes("mask-icon")) {
      add(href, "mask-icon", 45);
    } else if (rel.split(/\s+/).includes("icon")) {
      add(href, "favicon", 20 + Math.min(declaredSize / 10, 10));
    }
  }

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const name = (
      tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1] ?? ""
    ).toLowerCase();
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];

    if (name === "og:logo" || name === "msapplication-tileimage") {
      add(content, "og:logo", 58);
    } else if (name === "og:image" || name === "twitter:image") {
      add(content, "og:image", 15);
    }
  }

  // schema.org Organization markup usually points straight at the real logo.
  const jsonLdPattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(jsonLdPattern)) {
    const block = match[1];
    if (!/logo/i.test(block)) continue;

    for (const logo of block.matchAll(
      /"logo"\s*:\s*(?:\{[^}]*?"url"\s*:\s*)?"([^"]+)"/gi,
    )) {
      add(logo[1], "schema-logo", 50);
    }
  }

  for (const match of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const tag = match[0];
    const hint = tag.toLowerCase();
    if (!/logo|brand|wordmark|amblem|mark[-_ ]/.test(hint)) continue;

    const src =
      tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ??
      largestFromSrcset(tag.match(/srcset\s*=\s*["']([^"']+)["']/i)?.[1]);
    add(src, "header-logo", 55);
  }

  // Theme-builder pages often paint the brand with a CSS background or ship it
  // as inline SVG instead of a plain <img>.
  for (const match of html.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/gi)) {
    const raw = match[1];
    if (!/logo|brand|wordmark|amblem/i.test(raw)) continue;
    add(raw, "css-background", 42);
  }

  for (const match of html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)) {
    const svg = match[0];
    if (svg.length > 60_000) continue;
    if (!/logo|brand|wordmark|amblem/i.test(svg.slice(0, 240))) continue;

    const namespaced = /xmlns=/.test(svg)
      ? svg
      : svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    add(
      `data:image/svg+xml;base64,${Buffer.from(namespaced).toString("base64")}`,
      "inline-svg",
      52,
    );
  }

  // schema.org Organization/LocalBusiness markup points at the brand image even
  // when it carries no "logo" key.
  for (const match of html.matchAll(jsonLdPattern)) {
    const block = match[1];
    if (!/"(?:Organization|LocalBusiness)"/i.test(block)) continue;

    for (const image of block.matchAll(/"image"\s*:\s*"(https?:[^"]+)"/gi)) {
      add(image[1], "schema-image", 38);
    }
  }

  return [...candidates.values()].sort((a, b) => b.weight - a.weight);
}

async function readImage(url) {
  if (url.startsWith("data:")) {
    const [header, payload] = url.split(",");
    if (!header.includes("base64")) return null;
    return { buffer: Buffer.from(payload, "base64") };
  }

  const { body } = await fetchWithTimeout(url, { accept: "image/*,*/*" });
  return { buffer: body };
}

async function measure(buffer) {
  const metadata = await sharp(buffer, { density: 300 }).metadata();
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? "unknown",
    hasAlpha: Boolean(metadata.hasAlpha),
  };
}

function isUsableCandidate(candidate, size) {
  if (!size.width || !size.height) return false;

  const minimumEdge = Math.min(size.width, size.height);
  const maximumEdge = Math.max(size.width, size.height);
  if (minimumEdge < minLogoEdge) return false;
  if (maximumEdge / minimumEdge > maxAspectRatio) return false;

  // og:image is usually a hero photo, so only accept it when it is square-ish.
  if (candidate.source === "og:image" && maximumEdge / minimumEdge > 1.6)
    return false;

  return true;
}

/**
 * Crops the uniform margin around the artwork (transparent or solid) and stores
 * the logo at its own aspect ratio, so `object-fit: contain` can fill the tile
 * instead of re-shrinking an already letterboxed square.
 */
async function renderLogo(buffer, size) {
  let work = buffer;
  let width = size.width;
  let height = size.height;

  try {
    const trimmed = await sharp(buffer, { density: 300 })
      .trim({ threshold: trimTolerance })
      .toBuffer({ resolveWithObject: true });
    const keptArea = trimmed.info.width * trimmed.info.height;
    const sourceArea = size.width * size.height;

    if (
      trimmed.info.width >= minLogoEdge &&
      trimmed.info.height >= 24 &&
      keptArea >= sourceArea * 0.12
    ) {
      work = trimmed.data;
      width = trimmed.info.width;
      height = trimmed.info.height;
    }
  } catch {
    // Nothing to crop; keep the original artwork.
  }

  if (width / height > maxAspectRatio) return null;

  const logo = await sharp(work, { density: 300 })
    .resize(logoSize, logoSize, { fit: "inside", kernel: "lanczos3" })
    .webp({ quality: 92, effort: 4 })
    .toBuffer();

  return { logo, width, height };
}

async function collectFromWebsite(domain) {
  const origin = `https://${domain}`;
  // Homepage first; the about pages are only reached when it has no usable
  // logo, and they often carry a proper brand asset when the homepage only
  // ships a favicon.
  const homepages = [
    `${origin}/`,
    `http://${domain}/`,
    `${origin}/hakkimizda`,
    `${origin}/about`,
  ];
  const failures = [];
  // Whether the host ever answered. A domain that never responds (ENOTFOUND,
  // connect timeout) cannot serve a logo from any path, so the probe below is
  // skipped for it instead of burning 14 more timeouts.
  let responded = false;

  for (const homepage of homepages) {
    let html;
    try {
      const response = await fetchWithTimeout(homepage, {
        accept: "text/html",
        asText: true,
      });
      html = response.body;
      responded = true;
    } catch (error) {
      const code = error.cause?.code || error.message;
      failures.push(`${homepage} ${code}`);
      if (unreachableCodes.has(error.cause?.code)) break;
      continue;
    }

    const candidates = extractLogoCandidates(html, homepage);

    for (const candidate of candidates) {
      try {
        const { buffer } = await readImage(candidate.url);
        if (!buffer) continue;

        const size = await measure(buffer);
        if (!isUsableCandidate(candidate, size)) continue;

        const rendered = await renderLogo(buffer, size);
        if (!rendered) continue;

        return {
          source: candidate.source,
          assetUrl: candidate.url,
          size: { ...size, width: rendered.width, height: rendered.height },
          logo: rendered.logo,
          failures,
        };
      } catch (error) {
        failures.push(`${candidate.url} ${error.cause?.code || error.message}`);
      }
    }

    failures.push(`${homepage} no usable logo candidate`);
  }

  // Some sites never declare the brand in markup; the artwork just sits at a
  // conventional path. Probe those before falling back to the favicon, but only
  // when the host actually answered.
  for (const probePath of responded ? logoProbePaths : []) {
    const url = `${origin}${probePath}`;
    try {
      const { buffer } = await readImage(url);
      if (!buffer) continue;

      const size = await measure(buffer);
      if (!isUsableCandidate({ source: "path-probe" }, size)) continue;

      const rendered = await renderLogo(buffer, size);
      if (!rendered) continue;

      return {
        source: "path-probe",
        assetUrl: url,
        size: { ...size, width: rendered.width, height: rendered.height },
        logo: rendered.logo,
        failures,
      };
    } catch (error) {
      failures.push(`${url} ${error.cause?.code || error.message}`);
    }
  }

  return { source: null, logo: null, failures };
}

async function collectFaviconFallback(domain) {
  // Google caps this endpoint at 256px; larger values silently degrade to 16px.
  const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=${logoSize}`;

  try {
    const { buffer } = await readImage(url);
    if (!buffer)
      return { source: null, logo: null, failures: ["favicon: empty"] };

    const size = await measure(buffer);
    if (!size.width || Math.min(size.width, size.height) < minLogoEdge) {
      return { source: null, logo: null, failures: ["favicon: too small"] };
    }

    const rendered = await renderLogo(buffer, size);
    if (!rendered) {
      return {
        source: null,
        logo: null,
        failures: ["favicon: unusable ratio"],
      };
    }

    return {
      source: "google-favicon",
      assetUrl: url,
      size: { ...size, width: rendered.width, height: rendered.height },
      logo: rendered.logo,
      failures: [],
    };
  } catch (error) {
    return {
      source: null,
      logo: null,
      failures: [`favicon: ${error.message}`],
    };
  }
}

function normalizeName(value) {
  return value
    .toLocaleLowerCase("tr")
    .replace(/[^a-z0-9]+/gi, "")
    .trim();
}

async function discoverDomain(company) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;

  const district =
    company.locations.find((location) => location.address)?.address ?? "";
  const query = `${company.name} ${district} Kıbrıs resmi site`;
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?count=5&q=${encodeURIComponent(query)}`,
    {
      signal: AbortSignal.timeout(requestTimeoutMs),
      headers: { accept: "application/json", "x-subscription-token": apiKey },
    },
  );

  if (!response.ok) return null;

  const payload = await response.json();
  const wanted = normalizeName(company.name);

  for (const result of payload.web?.results ?? []) {
    let host;
    try {
      host = new URL(result.url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      continue;
    }

    if (platformHosts.has(host)) continue;
    if (!wanted) continue;

    // Only accept a result that actually names the company on its own site.
    try {
      const { body } = await fetchWithTimeout(`https://${host}/`, {
        accept: "text/html",
        asText: true,
      });
      const haystack = normalizeName(body);
      if (haystack.includes(wanted)) return host;
    } catch {
      continue;
    }
  }

  return null;
}

function ownDomains(company) {
  const domains = new Set();

  for (const location of company.locations) {
    if (!location.website) continue;

    try {
      const host = new URL(location.website).hostname
        .replace(/^www\./, "")
        .toLowerCase();
      if (!platformHosts.has(host)) domains.add(host);
    } catch {
      // Ignore malformed website values.
    }
  }

  return [...domains];
}

/**
 * Handles for the platforms whose public avatar we can read without a login.
 * The `domain` stored with the result is qualified with the handle so that two
 * companies pointing at the same platform never share a manifest key.
 */
function socialHandles(company) {
  const found = new Map();

  for (const location of company.locations) {
    if (!location.website) continue;

    let url;
    try {
      url = new URL(location.website);
    } catch {
      continue;
    }

    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const segments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    const path = segments.join("/");
    const last = segments.at(-1) ?? "";
    const key = last.toLowerCase();

    if (host === "facebook.com" || host === "fb.com") {
      if (
        !last ||
        ["share", "groups", "profile.php", "watch"].includes(segments[0])
      )
        continue;
      found.set(`facebook:${key}`, {
        kind: "facebook",
        handle: last,
        label: "facebook-avatar",
        domain: `facebook.com/${key}`,
      });
    } else if (host === "twitter.com" || host === "x.com") {
      if (
        !last ||
        ["home", "search", "i", "intent", "share"].includes(segments[0])
      )
        continue;
      found.set(`twitter:${key}`, {
        kind: "twitter",
        handle: last,
        label: "twitter-avatar",
        domain: `twitter.com/${key}`,
      });
    } else if (host === "linktr.ee" && path) {
      found.set(`linktree:${path}`, {
        kind: "page",
        url: `https://linktr.ee/${path}`,
        label: "linktree-avatar",
        domain: `linktr.ee/${path}`,
      });
    } else if (host === "sites.google.com" && path) {
      found.set(`googlesites:${path}`, {
        kind: "page",
        url: `https://sites.google.com/${path}`,
        label: "google-sites-image",
        domain: `sites.google.com/${path}`,
      });
    }
  }

  return [...found.values()];
}

/**
 * Reads the first usable social preview image. Only meta tags are consulted:
 * on those hosts the favicon belongs to the platform, not to the business.
 */
function extractMetaImage(html, baseUrl) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const name = (
      tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1] ?? ""
    ).toLowerCase();
    if (!["og:image", "og:image:secure_url", "twitter:image"].includes(name))
      continue;

    const resolved = resolveAssetUrl(
      tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1],
      baseUrl,
    );
    if (resolved && !/\.svg(\?|$)/i.test(resolved)) return resolved;
  }

  return null;
}

async function collectFromImage(url, source) {
  try {
    const { buffer } = await readImage(url);
    if (!buffer)
      return { source: null, logo: null, failures: [`${source}: empty`] };

    if (
      buffer.length < minSocialBytes ||
      socialPlaceholders.some((placeholder) => placeholder.equals(buffer))
    ) {
      return {
        source: null,
        logo: null,
        failures: [`${source}: placeholder`],
      };
    }

    const size = await measure(buffer);
    if (!isUsableCandidate({ source }, size)) {
      return {
        source: null,
        logo: null,
        failures: [`${source}: unusable ${size.width}x${size.height}`],
      };
    }

    const rendered = await renderLogo(buffer, size);
    if (!rendered) {
      return {
        source: null,
        logo: null,
        failures: [`${source}: unusable ratio`],
      };
    }

    return {
      source,
      assetUrl: url,
      size: { ...size, width: rendered.width, height: rendered.height },
      logo: rendered.logo,
      failures: [],
    };
  } catch (error) {
    return {
      source: null,
      logo: null,
      failures: [`${source}: ${error.cause?.code || error.message}`],
    };
  }
}

async function collectFromSocialPage(social) {
  try {
    const { body } = await fetchWithTimeout(social.url, {
      accept: "text/html",
      asText: true,
    });
    const imageUrl = extractMetaImage(body, social.url);
    if (!imageUrl) {
      return {
        source: null,
        logo: null,
        failures: [`${social.label}: no meta image`],
      };
    }

    return await collectFromImage(imageUrl, social.label);
  } catch (error) {
    return {
      source: null,
      logo: null,
      failures: [`${social.label}: ${error.cause?.code || error.message}`],
    };
  }
}

/**
 * The Graph endpoint answers with a grey silhouette for pages that never
 * uploaded a picture, and `redirect=false` is the only stable way to tell it
 * apart from real artwork (an HTTP 200 either way).
 */
async function collectFacebookAvatar(handle, label) {
  const url = `https://graph.facebook.com/${encodeURIComponent(handle)}/picture?type=large&redirect=false`;

  try {
    const { body } = await fetchWithTimeout(url, {
      accept: "application/json",
      asText: true,
    });
    const payload = JSON.parse(body);
    if (!payload?.data?.url || payload.data.is_silhouette === true) {
      return { source: null, logo: null, failures: [`${label}: silhouette`] };
    }

    return await collectFromImage(payload.data.url, label);
  } catch (error) {
    return {
      source: null,
      logo: null,
      failures: [`${label}: ${error.cause?.code || error.message}`],
    };
  }
}

async function collectFromSocial(socials) {
  const failures = [];

  for (const social of socials) {
    const collected =
      social.kind === "facebook"
        ? await collectFacebookAvatar(social.handle, social.label)
        : social.kind === "twitter"
          ? await collectFromImage(
              `https://unavatar.io/twitter/${encodeURIComponent(social.handle)}`,
              social.label,
            )
          : await collectFromSocialPage(social);

    failures.push(...collected.failures);
    if (collected.logo)
      return { ...collected, domain: social.domain, failures };
  }

  return { source: null, logo: null, failures };
}

async function loadSocialPlaceholders() {
  try {
    const { buffer } = await fetchWithTimeout(unavatarFallbackUrl, {
      accept: "image/*",
    });
    socialPlaceholders.push(buffer);
  } catch {
    // Best effort: the size floor still filters the obvious placeholders.
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

const directory = await readJson(directoryPath, null);
if (!Array.isArray(directory))
  throw new Error("company-directory.json could not be read.");

// Optional: researched domains that replace the unreliable directory website.
const hintFile = await readJson(hintDomainsPath, { domains: {} });
const hintDomains = hintFile?.domains ?? {};

const previousManifest = await readJson(manifestPath, { logos: {} });
const manifest = {
  generatedAt: previousManifest.generatedAt ?? null,
  logos: { ...(previousManifest.logos ?? {}) },
};

await mkdir(outputDirectory, { recursive: true });

const work = [];
for (const company of directory) {
  if (options.only && company.id !== options.only) continue;
  if (options.hinted && !hintDomains[company.id]) continue;
  if (
    options.sitesOnly &&
    !hintDomains[company.id] &&
    ownDomains(company).length === 0
  )
    continue;
  if (!options.force && manifest.logos[company.id]) continue;
  if (work.length >= options.limit) break;
  work.push(company);
}

console.log(
  `${directory.length} companies, ${work.length} queued, ${Object.keys(manifest.logos).length} already collected.`,
);

let completed = 0;
let stored = 0;
let discovered = 0;
const unresolved = [];

async function processCompany(company) {
  // Researched domains win over the directory value, which is often dead.
  let domains = [
    ...new Set([...(hintDomains[company.id] ?? []), ...ownDomains(company)]),
  ];
  const socials = socialHandles(company);
  let result = null;

  for (const domain of domains) {
    const collected = await collectFromWebsite(domain);
    if (collected.logo) {
      result = { ...collected, domain };
      break;
    }

    const fallback = await collectFaviconFallback(domain);
    if (fallback.logo) {
      result = { ...fallback, domain, failures: collected.failures };
      break;
    }

    unresolved.push({
      id: company.id,
      name: company.name,
      reason: "website gave no logo",
      detail: collected.failures.slice(-2).join(" | "),
    });
  }

  if (!result && socials.length > 0) {
    const social = await collectFromSocial(socials);
    if (social.logo) {
      result = social;
    } else {
      unresolved.push({
        id: company.id,
        name: company.name,
        reason: "social profile gave no logo",
        detail: social.failures.slice(-2).join(" | "),
      });
    }
  }

  if (!result && options.discover) {
    const domain = await discoverDomain(company);
    if (domain) {
      discovered += 1;
      domains = [domain];

      const collected = await collectFromWebsite(domain);
      result = collected.logo
        ? { ...collected, domain }
        : { ...(await collectFaviconFallback(domain)), domain };
    }
  }

  completed += 1;

  if (!result?.logo) {
    if (domains.length === 0 && socials.length === 0) {
      unresolved.push({
        id: company.id,
        name: company.name,
        reason: options.discover
          ? "no domain found"
          : "no website in directory",
        detail: "",
      });
    }
    return;
  }

  if (options.dryRun) {
    console.log(
      `[dry-run] ${company.name} <- ${result.domain} (${result.source})`,
    );
    return;
  }

  const fileName = `${company.id}.webp`;
  await writeFile(path.join(outputDirectory, fileName), result.logo);
  manifest.logos[company.id] = {
    file: `/logos/${fileName}`,
    domain: result.domain,
    source: result.source,
    width: result.size.width,
    height: result.size.height,
    fetchedAt: new Date().toISOString(),
  };
  stored += 1;

  if (completed % 20 === 0) {
    console.log(
      `  ...${completed}/${work.length} processed, ${stored} logos stored`,
    );
  }
}

async function run() {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(options.concurrency, work.length) },
    async () => {
      while (cursor < work.length) {
        const company = work[cursor];
        cursor += 1;

        try {
          await processCompany(company);
        } catch (error) {
          unresolved.push({
            id: company.id,
            name: company.name,
            reason: "unexpected error",
            detail: error.message,
          });
        }
      }
    },
  );

  await Promise.all(workers);
}

await loadSocialPlaceholders();
await run();

if (!options.dryRun) {
  manifest.generatedAt = new Date().toISOString();
  const sorted = Object.fromEntries(
    Object.entries(manifest.logos).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(
    manifestPath,
    `${JSON.stringify({ ...manifest, logos: sorted }, null, 2)}\n`,
  );
}

console.log(
  `\nprocessed ${completed}, logos stored ${stored}, domains discovered ${discovered}, unresolved ${unresolved.length}`,
);
for (const entry of unresolved.slice(0, 25)) {
  console.log(`  - ${entry.name}: ${entry.reason} ${entry.detail}`);
}
