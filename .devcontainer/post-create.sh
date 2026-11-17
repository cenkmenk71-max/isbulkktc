#!/usr/bin/env bash
set -euo pipefail

readonly BUN_VERSION="1.4.4"

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
fi

export PATH="$HOME/.bun/bin:$PATH"

if ! grep -Fq 'export PATH="$HOME/.bun/bin:$PATH"' "$HOME/.bashrc" 2>/dev/null; then
  printf '\n# Bun (project-pinned)\nexport PATH="$HOME/.bun/bin:$PATH"\n' >> "$HOME/.bashrc"
fi

actual_version="$(bun --version)"
if [[ "$actual_version" != "$BUN_VERSION" ]]; then
  echo "Expected Bun $BUN_VERSION, found $actual_version" >&2
  exit 1
fi

bun install --frozen-lockfile
