---
description: "Use when adding, changing, or debugging unit, integration, security, database, accessibility, or Playwright tests."
applyTo: "tests/**/*"
---

# Verification rules

- Match the test to the behavior: schema/edge cases in unit tests, authorization at the database boundary, and user-visible flows in Playwright.
- Include negative cases for invalid input, unauthenticated users and cross-account/company access wherever relevant; never prove security only by checking that a UI control is hidden.
- Keep fixtures synthetic. Do not use real user, candidate, payment, or production data.
- Run the narrowest applicable existing command and inspect its complete result. Use `npm run test:e2e` for the full Playwright suite and `npm run test:db` for Supabase/pgTAP.
- Do not mark skipped, emulated, unconfigured, or unavailable infrastructure tests as passing.
