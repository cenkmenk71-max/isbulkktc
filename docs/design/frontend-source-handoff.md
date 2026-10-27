# isbulKKTC Frontend

Responsive six-locale frontend for the İşBul KKTC Northern Cyprus career platform. The visual layer follows the supplied Signature Material Design System V3; it does not claim to be the complete production backend described by Architecture Specification V4.

## Run locally

Requires Node.js 24 LTS (the project pins the current security patch in `.nvmrc`) and npm 10+.

```bash
npm ci
npm run check:frontend-source
npm run typecheck
npm run dev
```

Use `npm run build` for the production build after the dependencies are installed.

## Included

- Single-source Vanadium Grey Metallic, Crayon and Shade Green palette with separate semantic status colours, energized by restrained emerald and brass accents.
- Locale-aware typography uses Literata display headings across Latin, Cyrillic, and Greek, Geist interface/body text, and IBM Plex Sans Arabic for Persian RTL. Next.js self-hosts the required script subsets at build time, avoiding third-party browser font requests.
- Local cinematic harbour hero, 16 optimized WebP sector photos, editorial news photography and Unsplash-licensed career, employer, community and company-office photos for image-led entry points and public-page heroes, delivered through Next.js Image.
- Reference-layer metallic feature strip at its native 1536 × 124 px crop; localized text and icons stay semantic DOM and the source image is optimized at quality 90.
- Source-locked three-line desktop headline, separate photo/readability/warmth/vignette layers, and sector medallions that overlap the image/content boundary.
- Reference-aligned navigation and first-fold hierarchy: harbour hero, exact copy placement, integrated role/region/work-mode search, role-search chips, four image-led sector cards and the three-point metallic feature strip. Search chips now set job-role keywords rather than unrelated sector filters.
- Dedicated freelance service-area discovery route plus the homepage company directory, six-region schematic, process explainer, package-principle cards and interactive employer dashboard preview.
- Message-catalog-driven TR/EN/RU/EL/FA/DE interface copy for public pages, account flows, company directory, package showcase, sector cards and shared controls; Hebrew remains a V4 target but is not enabled.
- Repeatable `npm run check:frontend-source` assertions for palette tokens, key contrast pairs, assets, in-page targets and preview-data boundaries.

## Data and production boundary

Homepage job, company, region, salary, verification and dashboard data are synthetic. Saved jobs use local storage where available. The first authentication/profile/company-creation slice is implemented as documented in `../architecture.md`; the homepage's real listings and applications, CV handling, billing/IBAN reconciliation, admin tools and external APIs are not connected. The package catalog intentionally contains no price or entitlement values until they are confirmed by the product owner.

The shared header, footer and generated site icons use the supplied raster brand mark and preserve its geometry; the black and Crayon-white variants are served from local optimized assets. The brand mark links to the homepage; a redundant homepage navigation item is intentionally omitted. The homepage feature-strip texture comes from the separated-layer package; its localized labels and icons remain semantic DOM rather than baked screenshot text. The harbour and sector images are local art-direction assets, not verified documentary photos. The freelance workspace photo is sourced from [Unsplash](https://images.unsplash.com/photo-1498050108023-c5249f4df085) and used under the [Unsplash License](https://unsplash.com/license); the original downloaded asset and its image URL are retained in `assets-src/freelance-photos/` and served as the freelance hero's full-bleed background. The career-choice photo source is retained in `assets-src/career-site-photos/` but is no longer displayed in the homepage hero. The about-page photo is sourced from [Unsplash](https://images.unsplash.com/photo-1551836022-d5d88e9218df), the contact-page photo from [Unsplash](https://images.unsplash.com/photo-1521737711867-e3b97375f902), the company-directory photo from [Unsplash](https://images.unsplash.com/photo-1497366811353-6870744d04b2), and the business-news image from [Unsplash](https://images.unsplash.com/photo-1504711434969-e33886168f5c). These representative photos are used under the [Unsplash License](https://unsplash.com/license); their original downloads are retained in `assets-src/career-site-photos/` and the app serves optimized local WebP derivatives. The candidate and employer entry links use restrained glass surfaces rather than cropped thumbnail photos. The Manrope variable font is distributed under the SIL Open Font License in `src/assets/fonts/OFL.txt`.

## Checks

`npm run check:frontend-source` is a repeatable static source gate, not a production-build test. Before release, install the locked dependencies and pass the full TypeScript check, Next.js build, Playwright/end-to-end, accessibility, performance, security and operational checks required by Architecture Specification V4.

## Selected design reference alignment

The header order and first-fold composition follow the selected harbour-reference image. Literal hero, search, chip, sector and feature text is stored in `src/messages/tr.json` and `src/messages/en.json`, so the copy is not duplicated ad hoc in components. Non-visible rich-text tags define intentional headline line breaks without changing the displayed copy. Palette and component roles follow the Signature Material Design System V3; the seven-locale target and phased activation follow Architecture Specification V4.

### Source-of-truth rules for this pass

- **Selected harbour screenshot:** controls the exact first-fold copy, order and composition.
- **Signature Material Design System V3:** controls palette values, semantic roles, button/form states, surfaces and restraint around metallic/glass effects.
- **Architecture Specification V4:** controls product-domain scope, required routes/features and staged seven-locale target. It is a target architecture, not proof the backend exists.
- **No inferred business facts:** prices, currency, live listing stats, payment details and integrations are not made up.

## Official brand symbol — supplied 14 Oct 2026

The black symbol was sourced from the project's supplied `10709.png`. Its white canvas has been removed with an antialiased alpha matte; the source geometry has not been redrawn. The source file is preserved at `public/images/isbul-logo-source.png`. The frontend uses the black transparent variant on light surfaces and a same-shape Crayon-white variant on dark surfaces for contrast. The wordmark `isbul / KKTC` remains next to the supplied symbol as the site lockup. Browser and Apple icons are generated from the same symbol.
