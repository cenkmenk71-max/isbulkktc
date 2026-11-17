# Cloud development environment

This configuration is for GitHub Codespaces. It provisions Node.js 24, Docker
support for the local Supabase stack, Bun 1.4.4, the locked project dependencies,
and the VS Code extensions used for this project.

## Create the Codespace

1. Open the repository on GitHub and choose **Code → Codespaces**.
2. Create a Codespace from the `chore/codespaces-kilo-setup` branch while this
   setup is under review, or from `main` after the pull request is merged.
3. Select a 4-core machine with at least 16 GB RAM where available. The project
   uses Next.js, Supabase containers, and Playwright; smaller machines may be
   constrained during full E2E runs.
4. Wait for the post-create step to finish. It installs Bun 1.4.4 and runs
   `bun install --frozen-lockfile`.

## Kilo Code and Alibaba Cloud Model Studio

Kilo Code is installed in the remote Codespace extension host. Configure it
inside that Codespace:

1. Open Kilo Code and its Settings.
2. Go to **Providers → Alibaba Cloud**.
3. Choose the Singapore / International Model Studio endpoint.
4. Enter the standard Model Studio API key created in the Singapore region.
5. Select an available model from Kilo's model picker. Prefer `qwen4-max`
   only if it is actually listed and enabled for this API key.

Do not commit API keys, add them to project files, or paste them into chat.
Keep provider credentials in Kilo's remote user-level secret storage. A GitHub
Codespaces secret may also be created under **GitHub Settings → Secrets and
variables → Codespaces**, scoped only to this repository, but environment
variables guaranteed in terminal sessions are not automatically guaranteed to
be visible to every VS Code extension host.

## Project checks

Read `AGENTS.md` before asking an agent to change code. The repository's
authoritative product architecture and security boundaries remain in
`docs/architecture-v4.md`, `docs/architecture.md`, and the applicable
instructions under `.github/` and `.agents/skills/`.

Fast checks:

```bash
bun run lint
bun run typecheck
bun run check:frontend-source
bun run test:unit
bun run test:security
bun run test:integration
```

Build and browser tests:

```bash
NEXT_DIST_DIR=.next-codespaces bun run build
bunx playwright install --with-deps chrome
bun run test:e2e
```

Database tests (Docker is provided by the dev container feature):

```bash
bun run db:start
bun run test:db
bun run db:stop
```

The production build must use a throwaway `NEXT_DIST_DIR`; see the build warning
in `AGENTS.md`. Never run a production build into the default `.next`
directory in a working tree.

## Git workflow

Use a dedicated feature branch for each task and open a pull request to
`main`. CI runs on pull requests. Do not push directly to `main`, and do not
merge the existing payment-system branch as part of this environment setup.
