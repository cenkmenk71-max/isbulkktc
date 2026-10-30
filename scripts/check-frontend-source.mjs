import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const exists = async (path) =>
  access(new URL(`../${path}`, import.meta.url), constants.F_OK);

// Homepage hero and sector photos are served as WebP at quality 90.
//
// Measured against quality 100 on the six originals at their largest served
// width (1920px): PSNR 42.6-45.6 dB and SSIM 0.987-0.997, i.e. at or above the
// ~40 dB / 0.98 "visually indistinguishable" bar, for ~43% fewer bytes (the
// served homepage drops from 5.50 MB to ~3.1 MB at DPR 1).
//
// AVIF is not the answer in this Next version (16.4.2). It scales the AVIF
// quality by 50/80 (`node_modules/next/dist/server/image-optimizer/transform.js`)
// and encodes at effort 3, so `quality={100}` maps to AVIF 63 and scores far
// worse than WebP 100 (Girne: PSNR 35.9 / SSIM 0.964 vs 50.9 / 0.997). Even at
// effort 6 AVIF only matches WebP 90 for the same bytes while taking ~33s per
// image instead of ~0.6s, so `formats: ["image/webp"]` stays.
const homepageImageQuality = 90;

const css = await read("src/styles/global.css");
const home = await read("src/components/home/home-experience.tsx");
const homeJourneys = await read("src/components/home/home-journeys.tsx");
const sectorCard = await read("src/components/home/sector-card.tsx");
const sectorExplorer = await read("src/components/home/sector-explorer.tsx");
const signatureBanner = await read("src/components/home/signature-banner.tsx");
const header = await read("src/components/layout/site-header.tsx");
const footer = await read("src/components/layout/site-footer.tsx");
const freelance = await read(
  "src/components/freelance/freelance-experience.tsx",
);
const jobsExperience = await read(
  "src/components/jobs/jobs-experience.tsx",
);
const companyDirectoryPage = await read(
  "src/app/[locale]/(public)/companies/page.tsx",
);
const editorialPages = await read("src/features/editorial/brand-pages.tsx");
const accountSceneMedia = await read(
  "src/components/layout/account-scene-media.tsx",
);
const localeLayout = await read("src/app/[locale]/layout.tsx");
const packagesPage = await read(
  "src/components/packages/packages-experience.tsx",
);
const packagesShowcase = await read(
  "src/components/packages/packages-interactive-showcase.tsx",
);
const packagesPanel = await read(
  "src/experience/scenes/vend-pricing/components/Panel.tsx",
);
const packagesScene = await read(
  "src/experience/scenes/vend-pricing/components/Scene.tsx",
);
const packagesMachine = await read(
  "src/experience/scenes/vend-pricing/vend-machine.tsx",
);
const packagesMachineControls = await read(
  "src/experience/scenes/vend-pricing/components/Machine.tsx",
);
const packagesLabels = await read(
  "src/experience/scenes/vend-pricing/lib/labels.ts",
);
const packagesPlans = await read(
  "src/experience/scenes/vend-pricing/lib/plans.ts",
);
const packagesLive = await read(
  "src/experience/scenes/vend-pricing/lib/live.ts",
);
const dashboard = await read(
  "src/app/[locale]/(candidate)/profile/dashboard/page.tsx",
);
const profileForm = await read(
  "src/features/candidates/candidate-profile-form.tsx",
);
const profileAction = await read("src/features/candidates/actions.ts");
const profileSchema = await read("src/features/candidates/schemas.ts");
const userDal = await read("src/server/dal/user.ts");
const candidateProfileBaseMigration = await read(
  "supabase/migrations/20261013000000_v4_identity_companies_security.sql",
);
const candidateProfileSectionsMigration = await read(
  "supabase/migrations/20261014000000_v4_candidate_profile_sections.sql",
);
const nextConfig = await read("next.config.ts");
const trMessages = JSON.parse(await read("src/messages/tr.json"));
const enMessages = JSON.parse(await read("src/messages/en.json"));

const expectedTokens = new Map([
  ["--color-vanadium-50", "#f0f1ed"],
  ["--color-vanadium-100", "#e4e7e2"],
  ["--color-vanadium-200", "#d1d5d0"],
  ["--color-vanadium-300", "#b5bcb7"],
  ["--color-vanadium-400", "#929a96"],
  ["--color-vanadium-500", "#707875"],
  ["--color-vanadium-600", "#555d5a"],
  ["--color-vanadium-700", "#414846"],
  ["--color-vanadium-800", "#303735"],
  ["--color-vanadium-850", "#292f2d"],
  ["--color-vanadium-900", "#222827"],
  ["--color-vanadium-950", "#171b1a"],
  ["--color-crayon-50", "#f5f2eb"],
  ["--color-crayon-100", "#ece7de"],
  ["--color-crayon-200", "#e1dbd0"],
  ["--color-crayon-300", "#d2cbbf"],
  ["--color-crayon-400", "#bdb5a8"],
  ["--color-crayon-500", "#a59d90"],
  ["--color-crayon-600", "#8a8378"],
  ["--color-crayon-700", "#716a60"],
  ["--color-crayon-800", "#5a554d"],
  ["--color-crayon-950", "#38352f"],
  ["--color-crayon-surface", "#faf8f3"],
  ["--color-crayon-highlight", "#fffdf8"],
  ["--color-shade-green-50", "#f1f6f2"],
  ["--color-shade-green-100", "#e2ece5"],
  ["--color-shade-green-200", "#c6d8cb"],
  ["--color-shade-green-300", "#9cbba7"],
  ["--color-shade-green-400", "#709b82"],
  ["--color-shade-green-500", "#4b8066"],
  ["--color-shade-green-600", "#326c54"],
  ["--color-shade-green-700", "#245845"],
  ["--color-shade-green-800", "#194435"],
  ["--color-shade-green-900", "#123128"],
  ["--color-shade-green-950", "#0d211b"],
  ["--color-status-success", "#236746"],
  ["--color-status-success-bg", "#e8f4ec"],
  ["--color-status-warning", "#85520a"],
  ["--color-status-warning-bg", "#fff3d9"],
  ["--color-status-error", "#b42318"],
  ["--color-status-error-bg", "#fdebe9"],
]);

for (const [token, color] of expectedTokens) {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    css,
    new RegExp(`${escapedToken}\\s*:\\s*${color}\\b`, "i"),
    `Missing or changed design token ${token}`,
  );
}

const assets = [
  "assets-src/page-heroes/about.png",
  "assets-src/page-heroes/blog.png",
  "assets-src/page-heroes/companies.png",
  "assets-src/page-heroes/contact.png",
  "assets-src/page-heroes/freelance.png",
  "assets-src/page-heroes/jobs.png",
  "assets-src/page-heroes/packages.png",
  "public/images/Girne.webp",
  "public/images/Gazimağusa.webp",
  "public/images/güzelyurt.jpg",
  "public/images/iskele.jpg",
  "public/images/lefkoşa.jpeg",
  "public/images/lefke.jpg",
  "public/images/about-hero.webp",
  "public/images/contact-hero.webp",
  "public/images/companies-hero.webp",
  "public/images/blog-hero.webp",
  "public/images/jobs-hero.webp",
  "public/images/freelance-hero.webp",
  "public/images/packages-hero.webp",
  "src/assets/fonts/manrope-variable.ttf",
  "src/assets/fonts/OFL.txt",
  "src/assets/fonts/ADDITIONAL-FONTS-OFL.txt",
  "public/images/homepage-metal-feature-strip.png",
  "public/images/isbul-logo-mark-black.png",
  "public/images/isbul-logo-mark-white.png",
];
for (const asset of assets) await exists(asset);

const sectorPhotos = [
  ["technology", "technology", "pexels-zayed-hossain-52728970-36706460.jpg"],
  ["education", "education", "pexels-max-fischer-5212338.jpg"],
  ["health", "health", "pexels-shvetsa-6291246.jpg"],
  ["tourism", "tourism", "pexels-imda-12160204.jpg"],
  ["architecture", "architecture", "pexels-a-darmel-7641896.jpg"],
  [
    "construction",
    "construction",
    "pexels-anthonyshkraba-production-8278912.jpg",
  ],
  [
    "businessServices",
    "business-services",
    "pexels-august-de-richelieu-4427422.jpg",
  ],
  ["gastronomy", "gastronomy", "pexels-emris-17086288.jpg"],
  [
    "manufacturing",
    "manufacturing",
    "pexels-frans-van-heerden-201846-13974251.jpg",
  ],
  ["creativeMedia", "creative-media", "pexels-jonathanborba-13451104.jpg"],
  ["remoteWork", "remote-work", "pexels-mikhail-nilov-8297074.jpg"],
  [
    "renewableEnergy",
    "renewable-energy",
    "pexels-nc-farm-bureau-mark-15751132.jpg",
  ],
  ["agriculture", "agriculture", "pexels-nc-farm-bureau-mark-28513536.jpg"],
  ["foodProduction", "food-production", "pexels-silverkblack-36697940.jpg"],
  [
    "hospitality",
    "hospitality",
    "pexels-quang-nguyen-vinh-222549-14036250.jpg",
  ],
  ["logistics", "logistics", "pexels-shuaizhi-tian-485596-20715652.jpg"],
];
for (const [key, image, original] of sectorPhotos) {
  await exists(`assets-src/sector-photos/${original}`);
  await assert.rejects(
    exists(`public/images/sector-${image}.webp`),
    `Do not keep a duplicate public WebP for the original ${original}.`,
  );
  assert.match(
    home,
    new RegExp(
      `import ${image.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}Photo from "\\.\\.\\/\\.\\.\\/\\.\\.\\/assets-src\\/sector-photos\\/${original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
    ),
  );
  assert.ok(
    trMessages.HomePage.sectors[key],
    `Missing Turkish copy for ${key}.`,
  );
  assert.ok(
    enMessages.HomePage.sectors[key],
    `Missing English copy for ${key}.`,
  );
}
assert.equal(sectorPhotos.length, 16);
assert.equal(
  Object.keys(trMessages.HomePage.sectors).length,
  sectorPhotos.length,
);
assert.match(home, /image: StaticImageData/);
assert.match(sectorCard, /data-sector-image=\{sector\.image\.src\}/);
assert.match(sectorCard, /sizes="\(max-width: 1100px\) 50vw, 25vw"/);
assert.match(
  sectorCard,
  new RegExp(`quality=\\{${homepageImageQuality}\\}`),
);
assert.doesNotMatch(sectorCard, /unoptimized/);
assert.match(nextConfig, /formats:\s*\["image\/webp"\]/);

const homeHeroSources = [
  ["girnePhoto", "Girne.webp"],
  ["gazimagusaPhoto", "Gazimağusa.webp"],
  ["guzelyurtPhoto", "güzelyurt.jpg"],
  ["iskelePhoto", "iskele.jpg"],
  ["lefkosaPhoto", "lefkoşa.jpeg"],
  ["lefkePhoto", "lefke.jpg"],
];
for (const [importName, asset] of homeHeroSources) {
  assert.match(
    home,
    new RegExp(
      `import ${importName} from "\\.\\.\\/\\.\\.\\/\\.\\.\\/public\\/images\\/${asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
    ),
  );
  assert.match(
    home,
    new RegExp(
      `asset: "/images/${asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
    ),
  );
}
assert.doesNotMatch(
  home,
  /assets-src\/.*(?:Girne|kyrenia|gazimagusa|guzelyurt|iskele|lefkoşa|lefke)/i,
);

assert.match(
  home,
  /const homeHeroSlides = \[[\s\S]*district: "girne", asset: "\/images\/Girne\.webp", src: girnePhoto/,
);
assert.match(home, /data-home-hero-photo=\{slide\.district\}/);
assert.match(home, /data-home-hero-source=\{slide\.asset\}/);
assert.match(home, /className="home-hero-rays"/);
assert.doesNotMatch(home, /hero-description|copy\("subtitle"\)/);
assert.match(
  home,
  /district: "guzelyurt", asset: "\/images\/güzelyurt\.jpg", src: guzelyurtPhoto/,
);
assert.match(
  home,
  /district: "iskele", asset: "\/images\/iskele\.jpg", src: iskelePhoto/,
);
assert.doesNotMatch(home, /commons\.wikimedia\.org|creativecommons\.org/);
assert.match(freelance, /src="\/images\/freelance-hero\.webp"/);
assert.doesNotMatch(freelance, /assets-src\/freelance-photos/);
assert.match(
  localeLayout,
  /import \{ IBM_Plex_Sans_Arabic, Literata \} from "next\/font\/google"/,
);
assert.match(
  localeLayout,
  /subsets: \["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext"\]/,
);
assert.match(localeLayout, /subsets: \["arabic", "latin", "latin-ext"\]/);
assert.match(css, /--font-display:\s*var\(--font-literata\)/);
assert.match(
  css,
  /html\[lang="fa"\]\s*\{[^}]*--font-display:\s*var\(--font-plex-arabic\)/,
);
assert.match(css, /font-family:\s*var\(--font-display\)/);
assert.doesNotMatch(css, /-webkit-font-smoothing:\s*antialiased/);
assert.match(
  home,
  /loading=\{slide\.district === "girne" \|\| slide\.district === "gazimagusa" \? "eager" : "lazy"\}/,
);
assert.match(home, /sizes="100vw"/);
assert.match(home, new RegExp(`quality=\\{${homepageImageQuality}\\}`));
assert.match(home, /hero-light-layer--readability/);
assert.match(home, /hero-light-layer--warmth/);
assert.match(home, /hero-light-layer--vignette/);
assert.match(css, /@keyframes home-hero-photo-cycle/);
assert.match(
  css,
  /@keyframes hero-copy-enter/,
  "the hero copy intro must be a CSS animation so it plays before JavaScript loads",
);
assert.match(
  css,
  /animation:\s*hero-copy-enter[^;]*backwards/,
  "the hero intro must use `backwards` fill so each line is hidden during its delay",
);
assert.match(css, /@keyframes home-hero-rays-drift/);
assert.match(home, /<SignatureBanner\s*\/>/);
assert.match(home, /className="sector-showcase"/);
assert.match(
  sectorCard,
  new RegExp(`<Image\\s+src={sector\\.image}[\\s\\S]*?quality=\\{${homepageImageQuality}\\}`),
);
assert.doesNotMatch(sectorCard, /unoptimized/);
assert.match(home, /<SectorDirectory/);
assert.match(home, /featuredSectors\.map/);
assert.match(home, /allSectorData\s*=\s*sectors\.map/);
assert.match(home, /<SectorExplorer/);
assert.match(sectorExplorer, /type="search"/);
assert.match(sectorExplorer, /aria-pressed={selectedCategory/);
assert.match(sectorExplorer, /sector-explorer-empty/);
assert.match(homeJourneys, /href="\/register"/);
assert.match(
  homeJourneys,
  /pathname: "\/register", query: \{ audience: "employer" \}/,
);
assert.doesNotMatch(home, /home-career-visual|career-search\.webp/);
assert.doesNotMatch(css, /\.home-start-panel|\.home-start-option/);

for (const asset of [
  "Girne.webp",
  "Gazimağusa.webp",
  "güzelyurt.jpg",
  "iskele.jpg",
  "lefkoşa.jpeg",
  "lefke.jpg",
]) {
  const photo = await readFile(
    new URL(`../public/images/${asset}`, import.meta.url),
  );
  if (/\.webp$/i.test(asset)) {
    assert.equal(photo.toString("ascii", 0, 4), "RIFF");
    assert.equal(photo.toString("ascii", 8, 12), "WEBP");
  } else {
    assert.deepEqual([...photo.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  }
  assert.ok(
    photo.length < 9_000_000,
    `Original district image ${asset} is unexpectedly large.`,
  );
  assert.match(
    home,
    new RegExp(
      `asset: "/images/${asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
    ),
  );
}
for (const [asset, component] of [
  ["companies-hero", companyDirectoryPage],
  ["about-hero", editorialPages],
  ["contact-hero", editorialPages],
  ["blog-hero", editorialPages],
  ["jobs-hero", jobsExperience],
  ["freelance-hero", freelance],
  ["packages-hero", packagesPage],
]) {
  const optimized = await readFile(
    new URL(`../public/images/${asset}.webp`, import.meta.url),
  );
  assert.equal(optimized.toString("ascii", 0, 4), "RIFF");
  assert.equal(optimized.toString("ascii", 8, 12), "WEBP");
  assert.ok(
    optimized.length < 500_000,
    `Hero photo ${asset} should remain below 500 KB.`,
  );
  assert.match(component, new RegExp(`/images/${asset}\\.webp`));
  assert.match(
    component,
    new RegExp(`src="/images/${asset}\\.webp"[\\s\\S]{0,220}?quality=\\{85\\}`),
    `Page hero ${asset} should request quality 85.`,
  );
}
assert.match(editorialPages, /className="editorial-hero-background-image\b/);
assert.match(css, /\.editorial-hero\s*\{[\s\S]*?minmax\(300px,\s*0\.9fr\)/);

// Account scene videos must be real footage, not 6 KB placeholder stubs, and
// must ship the modern codec ladder (AV1 primary + H.264 fallback) with a poster.
const sceneVideos = ["othello-kalesi", "st-hilarion-kalesi", "mavi-kosk"];
function isFastStart(buffer) {
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset);
    if (size < 8) break;
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    if (type === "moov") return true;
    if (type === "mdat") return false;
    offset += size;
  }
  return false;
}
for (const name of sceneVideos) {
  const av1 = await readFile(
    new URL(`../public/videos/account-gallery/${name}.av1.mp4`, import.meta.url),
  );
  const h264 = await readFile(
    new URL(`../public/videos/account-gallery/${name}.mp4`, import.meta.url),
  );
  const poster = await readFile(
    new URL(
      `../public/videos/account-gallery/${name}-poster.webp`,
      import.meta.url,
    ),
  );
  assert.ok(
    av1.length > 400_000 && h264.length > 400_000,
    `Account scene video ${name} looks like a placeholder stub (av1 ${av1.length}B, h264 ${h264.length}B).`,
  );
  assert.ok(
    av1.length < 12_000_000 && h264.length < 12_000_000,
    `Account scene video ${name} exceeds the 12 MB budget per file.`,
  );
  assert.equal(av1.toString("latin1", 4, 8), "ftyp");
  assert.equal(h264.toString("latin1", 4, 8), "ftyp");
  assert.ok(isFastStart(av1), `${name}.av1.mp4 must be faststart (moov first).`);
  assert.ok(isFastStart(h264), `${name}.mp4 must be faststart (moov first).`);
  assert.equal(poster.toString("ascii", 0, 4), "RIFF");
  assert.equal(poster.toString("ascii", 8, 12), "WEBP");
  assert.match(
    accountSceneMedia,
    new RegExp(`/videos/account-gallery/${name}\\.av1\\.mp4`),
  );
  assert.match(
    accountSceneMedia,
    new RegExp(`/videos/account-gallery/${name}-poster\\.webp`),
  );
}
assert.match(accountSceneMedia, /av01\.0\.04M\.08/);
assert.match(accountSceneMedia, /avc1\.640028/);
assert.match(accountSceneMedia, /sources\.map/);
assert.match(accountSceneMedia, /poster=\{videos\[activeVideoIndex\]\.poster\}/);
assert.match(css, /\.editorial-hero\s*\{[\s\S]*?minmax\(300px,\s*0\.9fr\)/);
assert.match(css, /\.home-page \.hero-photo-image \{\s*transform: none;/);
assert.doesNotMatch(css, /\.hero-scene-window|\.hero-scene-foliage/);
// Every district carries a measured focal point, and no breakpoint may clobber
// it with a blanket object-position (the old 740px rule did, which is what made
// the phone crop look arbitrary).
for (const district of [
  "girne",
  "gazimagusa",
  "guzelyurt",
  "iskele",
  "lefkosa",
  "lefke",
]) {
  assert.match(
    css,
    new RegExp(
      `\\.home-page \\.hero-photo-image\\[data-home-hero-photo="${district}"\\] \\{\\s*object-position: [0-9]+% [0-9]+%;`,
    ),
  );
}
assert.doesNotMatch(css, /object-position: 64% center/);
assert.doesNotMatch(css, /object-position: right bottom/);
assert.match(
  (
    await readFile(new URL("../scripts/measure-hero-crops.mjs", import.meta.url))
  ).toString(),
  /bestOffset/,
);
assert.match(signatureBanner, /homepage-metal-feature-strip\.png/);
assert.match(signatureBanner, /useTranslations\('FeatureStrip'\)/);
assert.match(nextConfig, /qualities:\s*\[75,\s*85,\s*90,\s*95,\s*100\]/);
assert.match(packagesPage, /src="\/images\/packages-hero\.webp"/);
assert.doesNotMatch(packagesPage, /assets-src\/kyrenia-harbor/);
assert.match(packagesPage, /quality=\{85\}/);
assert.doesNotMatch(packagesPage, /unoptimized/);

for (const path of [home, header, footer, freelance]) {
  assert.doesNotMatch(
    path,
    /#(?:jobs|companies|packages|employers|how-it-works|product-notice)/,
  );
  assert.doesNotMatch(
    path,
    /demo-content|sampleListings|sampleCategories|applicationSubmitted/,
  );
}
assert.match(header, /href: '\/freelance'/);
assert.doesNotMatch(header, /navCopy\('home'\)|icon:\s*House/);
assert.match(header, /<Link href="\/#top" aria-label={navCopy\('homeLabel'\)}/);
assert.match(header, /href: '\/companies'/);
assert.match(header, /href: '\/packages'/);
assert.equal(trMessages.Nav.freelance, "Serbest çalışma");
assert.equal(trMessages.Nav.employer, "Şirketler");
assert.equal("home" in trMessages.Nav, false);
assert.equal(trMessages.Nav.packages, "Paketler");
assert.doesNotMatch(
  header,
  /is-planned|code: 'ru'|code: 'el'|code: 'fa'|code: 'de'|code: 'he'/,
);
assert.match(footer, /href="\/profile\/dashboard"/);
assert.match(freelance, /href="\/register"/);
assert.doesNotMatch(freelance, /category|search|filter|sample|demo/i);
assert.match(packagesPage, /href="#packages-current"/);
assert.match(packagesPage, /preload/);
assert.match(packagesPage, /const packageTiers = \[/);
assert.match(packagesPage, /const packageTerms = \{/);
assert.match(packagesPage, /<PackagesInteractiveShowcase/);
assert.doesNotMatch(
  packagesPage,
  /InteractivePackageCard|packages-card-visual/,
);
assert.match(packagesShowcase, /role="group"/);
assert.match(packagesPanel, /aria-pressed=/);
assert.match(
  packagesPanel,
  /quoteEmailBody\.replace\("%DAYS%", String\(selectedDuration\)\)/,
);
assert.doesNotMatch(packagesShowcase, /packages-vend-selector/);
assert.match(packagesShowcase, /packages-vend-accessible-controls/);
assert.match(packagesShowcase, /IntersectionObserver/);
assert.match(packagesShowcase, /controlsRef\.current\.press\(index\)/);
assert.match(packagesShowcase, /controlsRef\.current\.insertCoin\(\)/);
assert.match(packagesShowcase, /data-can-phase/);
assert.match(packagesShowcase, /data-coin-phase/);
assert.match(
  packagesPanel,
  /pathname: "\/register", query: \{ audience: "employer" \}/,
);
assert.match(packagesScene, /<Canvas/);
assert.match(packagesScene, /REDUCED_MOTION/);
assert.match(packagesScene, /function PointerTracker\(\)/);
assert.match(packagesScene, /const isCloseUp = frame\.dolly > 0\.25/);
assert.match(packagesScene, /dpr=\{closeUp \? maxDpr : baseDpr\}/);
assert.match(
  packagesLive,
  /live\.motionUntil = REDUCED_MOTION && !CAPTURE \? clock\.time \+ VEND_DONE/,
);
assert.match(packagesLive, /sfx\.coin\(\)/);
// The scene no longer probes WebGL with a throwaway context (a second context
// can exhaust the hosted browser's budget before Canvas initialises). Failure
// handling moved to the error boundary in vend-machine.tsx plus the context
// guard in Scene.tsx, so assert on those instead.
assert.match(packagesMachine, /class SceneErrorBoundary/);
assert.match(packagesMachine, /getDerivedStateFromError/);
assert.match(packagesScene, /function WebGLContextGuard/);
assert.match(packagesScene, /"webglcontextlost"/);
assert.match(packagesMachine, /onUnavailable/);
assert.match(
  packagesMachine,
  /addEventListener\("pointerdown", unlock, true\)/,
);
assert.match(packagesMachine, /sound\.mode = "fx"/);
assert.match(packagesMachineControls, /unlockAudio\(\);\s*fn\(\)/);
assert.doesNotMatch(packagesPage, /number: "0[1-4]"/);
assert.doesNotMatch(packagesPlans, /HEADLINE|TAGLINE|PLAN_COLORS/);
assert.doesNotMatch(packagesMachineControls, /interactive\?/);
assert.match(packagesLabels, /getComputedStyle\(document\.documentElement\)/);
assert.match(packagesLabels, /texture\(2048, 768/);
assert.match(packagesLabels, /textScale = 1/);
assert.match(packagesLabels, /new THREE\.DataTexture/);
assert.match(packagesLabels, /export function makeFallbackLabels/);
assert.match(packagesScene, /makeFallbackLabels/);
assert.match(packagesLabels, /toLocaleUpperCase\(labels\.locale\)/);
assert.doesNotMatch(
  packagesLabels,
  /copy\.info|copy\.push|labels\.ic|labels\.flap/,
);
assert.doesNotMatch(packagesMachine, /labels\.ic|labels\.flap|IC_Y/);
assert.match(packagesLabels, /t\.anisotropy = 16/);
assert.match(packagesLabels, /rgba\(201,216,210,0\.16\)/);
assert.match(packagesLabels, /strokeStyle = "rgba\(4,12,10,0\.88\)"/);
assert.doesNotMatch(packagesLabels, /var\(--font-geist-/);
assert.match(css, /\.packages-vend-section/);
assert.match(css, /\.packages-vend-fallback/);
assert.equal(Object.keys(trMessages.PackagesPage.showcase.cards).length, 4);
assert.match(trMessages.PackagesPage.showcase.pricing.quoteEmailBody, /%DAYS%/);
assert.match(enMessages.PackagesPage.showcase.pricing.quoteEmailBody, /%DAYS%/);
assert.equal(
  trMessages.PackagesPage.showcase.scene.viewScope,
  "Jetonla Paketi Değiştir",
);
assert.equal(
  trMessages.PackagesPage.showcase.scene.insertCoin,
  "Jetonla Paketi Değiştir",
);
assert.equal(
  enMessages.PackagesPage.showcase.scene.viewScope,
  "Change Package with a Coin",
);
assert.doesNotMatch(packagesPage, /showcase\.status/);
assert.doesNotMatch(packagesShowcase, /packageStatus|priceDisclaimer/);
assert.doesNotMatch(packagesPanel, /packageStatus|priceDisclaimer/);
assert.doesNotMatch(css, /\.package-proposal-status|\.vend-panel-status|\.vend-panel-price-disclaimer/);
// The database-backed "job posting rights" catalog was removed from /packages;
// only its hero-bottom eyebrow survives. Guard against reintroducing it.
assert.doesNotMatch(packagesPage, /package-catalog-title|getActiveJobPackages/);
assert.doesNotMatch(packagesPage, /catalog\.(?:title|description|activeJobs|duration|days|empty|noDescription)/);
assert.doesNotMatch(css, /\.package-catalog-empty/);
// The vending machine's brand lockup ("İşBul KKTC · KARİYER PLATFORMU") was
// removed; the header already carries the brand.
assert.doesNotMatch(packagesShowcase, /packages-vend-mark|platformLabel/);
assert.doesNotMatch(packagesPage, /platformLabel/);
assert.doesNotMatch(css, /\.packages-vend-mark/);
assert.doesNotMatch(
  `${JSON.stringify(trMessages.PackagesPage)} ${JSON.stringify(enMessages.PackagesPage)}`,
  /platformLabel/,
);
assert.doesNotMatch(
  `${JSON.stringify(trMessages.PackagesPage.catalog)} ${JSON.stringify(enMessages.PackagesPage.catalog)}`,
  /"(?:title|description|activeJobs|duration|days|empty|noDescription)"/,
);
assert.doesNotMatch(
  `${JSON.stringify(trMessages.PackagesPage)} ${JSON.stringify(enMessages.PackagesPage)}`,
  /\b\d[\d,.]*\s*(?:TL|TRY|GBP|EUR|₺|£|€)/,
);
assert.match(packagesPage, /prices: \{ 1: \d+, 7: \d+, 30: \d+ \}/);
assert.match(packagesPage, /listingCount: 1/);
assert.match(packagesPage, /listingCount: 3/);
assert.match(packagesPage, /listingCount: 5/);
assert.doesNotMatch(
  `${packagesPage} ${JSON.stringify(trMessages.PackagesPage)} ${JSON.stringify(enMessages.PackagesPage)}`,
  /sample|demo|order|checkout|payment now|pay now|paket satın al|şimdi öde/i,
);

assert.match(dashboard, /getCandidateWorkspace/);
assert.match(companyDirectoryPage, /await connection\(\)/);
assert.match(profileForm, /saveCandidateProfile/);
assert.match(profileAction, /getCurrentUser/);
assert.match(profileAction, /candidateProfileSchema\.safeParse/);
assert.match(profileAction, /from\("candidate_profiles"\)\.upsert/);
assert.doesNotMatch(profileAction, /visibility\s*:/);
assert.match(
  candidateProfileBaseMigration,
  /visibility text not null default 'private'/,
);
assert.match(
  candidateProfileSectionsMigration,
  /revoke insert \(visibility\), update \(visibility\)/,
);
assert.match(userDal, /from\("candidate_profiles"\)/);
assert.match(profileSchema, /\.max\(140\)/);
assert.match(profileSchema, /\.max\(120\)/);
assert.match(profileSchema, /\.max\(40\)/);
assert.doesNotMatch(profileForm, /name="user_id"|name="userId"/);

const trCopy = JSON.stringify(trMessages);
const enCopy = JSON.stringify(enMessages);
for (const copy of [trCopy, enCopy]) {
  assert.doesNotMatch(copy, /demo|sample/i);
}

function keyShape(value) {
  if (Array.isArray(value)) return value.map(keyShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, keyShape(value[key])]),
    );
  }
  return typeof value;
}
assert.deepEqual(keyShape(trMessages), keyShape(enMessages));

assert.match(css, /--ink-2:\s*var\(--color-vanadium-800\)/);
assert.match(css, /--ink-3:\s*var\(--color-vanadium-700\)/);
assert.match(css, /--ink-4:\s*var\(--color-vanadium-600\)/);
assert.match(css, /--ring:\s*var\(--color-shade-green-700\)/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.doesNotMatch(css, /169\s*,\s*226\s*,\s*203/i);

function luminance(hex) {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    .map((part) => Number.parseInt(part, 16) / 255);
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrast(foreground, background) {
  const [high, low] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (high + 0.05) / (low + 0.05);
}
for (const [foreground, background, minimum] of [
  ["#171b1a", "#f5f2eb", 4.5],
  ["#414846", "#faf8f3", 4.5],
  ["#555d5a", "#faf8f3", 4.5],
  ["#b5bcb7", "#222827", 4.5],
  ["#9cbba7", "#222827", 4.5],
  ["#fffdf8", "#194435", 4.5],
  ["#123128", "#e2ece5", 4.5],
  ["#245845", "#faf8f3", 3],
  ["#9cbba7", "#222827", 3],
  ["#236746", "#e8f4ec", 4.5],
  ["#85520a", "#fff3d9", 4.5],
  ["#b42318", "#fdebe9", 4.5],
]) {
  assert.ok(contrast(foreground, background) >= minimum);
}

// Micro-labels must not shrink below the smallest design token (--type-caption =
// 0.6875rem = 11px). Mobile media queries used to drop kickers, footer labels and
// the brand mark to 7-9px, which the token test cannot see because it only reads
// the token value, never the literals. Assert the floor against the literals.
const captionFloorPx = 10;
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
const undersized = [];
for (const [, value, unit] of cssWithoutComments.matchAll(
  /font-size:\s*([\d.]+)(px|rem)/g,
)) {
  const px = unit === "rem" ? Number(value) * 16 : Number(value);
  if (px < captionFloorPx) undersized.push(`${value}${unit} (${px}px)`);
}
for (const [, shorthand] of cssWithoutComments.matchAll(/(?:^|[\s;{])font:\s*([^;{}]+);/g)) {
  const size = shorthand.match(/(?:^|\s)([\d.]+)(px|rem)(?:\s*\/|\s)/);
  if (!size) continue;
  const px = size[2] === "rem" ? Number(size[1]) * 16 : Number(size[1]);
  if (px < captionFloorPx) undersized.push(`${size[1]}${size[2]} (${px}px)`);
}
assert.deepEqual(
  undersized,
  [],
  `font sizes below the ${captionFloorPx}px caption floor: ${undersized.join(", ")}`,
);

// Motion layer contract. The site ships a GSAP + Lenis layer that must stay
// (a) lazy, so it cannot delay first paint, (b) opt-in per element, so a
// component without `data-reveal` is never hidden, and (c) fully disabled under
// `prefers-reduced-motion: reduce`. Each assertion below pins one of those
// properties; removing the feature must fail the gate, not silently pass.
const motionController = await read("src/components/motion/motion-controller.tsx");
const packageJson = JSON.parse(await read("package.json"));
assert.match(
  packageJson.dependencies.gsap ?? "",
  /^\^?3\./,
  "gsap must stay a runtime dependency of the motion layer",
);
assert.match(
  packageJson.dependencies.lenis ?? "",
  /^\^?1\./,
  "lenis must stay a runtime dependency of the motion layer",
);
assert.match(
  motionController,
  /import\("gsap"\)/,
  "GSAP must be loaded through a dynamic import so it stays out of the first paint",
);
assert.match(
  motionController,
  /prefers-reduced-motion:\s*reduce/,
  "the motion layer must opt out under prefers-reduced-motion",
);
assert.match(
  motionController,
  /REVEAL_SELECTOR\s*=\s*"\[data-reveal\]"/,
  "reveals must be opt-in via [data-reveal]",
);
assert.doesNotMatch(
  motionController,
  /autoAlpha/,
  "autoAlpha sets visibility:hidden, which would hide revealed content from the axe audit",
);
assert.match(localeLayout, /<MotionController\s*\/>/);
assert.match(localeLayout, /import \{ MotionController \}/);
assert.match(sectorCard, /data-reveal/);
assert.match(homeJourneys, /data-reveal/);
assert.match(signatureBanner, /data-reveal/);
assert.match(css, /@keyframes home-hero-photo-cycle/);
assert.match(
  css,
  /@keyframes hero-copy-enter/,
  "the hero copy intro must be a CSS animation so it plays before JavaScript loads",
);
assert.match(
  css,
  /animation:\s*hero-copy-enter[^;]*backwards/,
  "the hero intro must use `backwards` fill so each line is hidden during its delay",
);

console.log(
  `Source checks passed: ${expectedTokens.size} design tokens, uploaded photos and 16 original sector images with responsive optimization, real candidate/company entry points, private profile writes, six-locale routing with disclosed translation coverage, contrast and motion rules.`,
);
