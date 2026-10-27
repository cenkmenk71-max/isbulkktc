---
name: deep-audit
description: "Use when asked to deep-search, thoroughly audit, find mistakes, bugs, security or logical flaws, or verify that implemented features really work."
---

# Deep implementation audit

1. Establish the requested scope and the authoritative spec. For this project, V4 is the only architecture source; separate implementation status from planned requirements.
2. Trace reachable user workflows end to end: route/UI → form/action/handler → schema → server authentication/DAL → database function/grants/RLS → test coverage.
3. Search for callers, route targets and competing configuration; read complete relevant file ranges before judging behavior.
4. Check concrete edge cases and threat boundaries: anonymous/other-user access, suspended status, duplicate submissions, malformed input, redirects/cookies, unhandled errors and missing configuration.
5. Execute the narrow relevant test/lint/type/build command. Do not substitute source-pattern matches for runtime evidence or claim unavailable integrations were verified.
6. Fix only confirmed defects in scope when implementation is requested. Add a regression test and rerun verification.
7. Report findings by severity with absolute file/line links and evidence; list planned-but-disabled features and infrastructure blockers separately. Do not call an audit a security certification.
