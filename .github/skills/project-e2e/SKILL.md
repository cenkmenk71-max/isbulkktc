---
name: project-e2e
description: "Use when adding or diagnosing this project's Playwright E2E regression tests, validating route flows, or checking app accessibility before release."
---

# Verify this project's browser behavior

1. Read `playwright.config.ts`, the affected test, and the route/component. Use the official `.agents/skills/playwright-cli/SKILL.md` for exploratory browser sessions; do not copy its generic browser command reference here.

   ```powershell
   npx playwright-cli --help
   npx playwright-cli open http://localhost:3000
   ```

2. Prefer the deterministic, synthetic-data regression suite for assertions and CI coverage:

   ```powershell
   npm run test:e2e
   ```

3. Check semantics, labels, keyboard-accessible actions and responsive behavior. Do not rely only on screenshots or hidden controls as proof of authorization.
4. Extend `tests/e2e/` with user-observable assertions, not production-account automation; include failure and auth boundaries where relevant.
5. Report the browser/runtime actually used and include screenshots only when they help diagnose a visual issue.
