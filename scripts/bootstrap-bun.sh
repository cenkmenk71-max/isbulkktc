#!/usr/bin/env bash
# Install bun without sudo, without unzip, and without the official installer.
#
# Why this exists: the agent sandbox ships neither `bun` nor `unzip`, and has no
# usable `sudo`. The official installer (`curl https://bun.sh/install | bash`)
# needs unzip and fails. `npm install -g bun` needs a writable global prefix.
# This downloads the release archive and extracts it with Python's stdlib, which
# is always present. Idempotent: exits immediately if bun already runs.
#
# After running it, `bun` is on PATH for the rest of the session, and the gates
# from AGENTS.md work:
#   bun run lint && bun run typecheck && bun run check:frontend-source && bun run test:unit

set -euo pipefail

BUN_VERSION="${BUN_VERSION:-1.4.4}"

if command -v bun >/dev/null 2>&1 && bun --version >/dev/null 2>&1; then
  echo "bun already available: $(bun --version)"
  exit 0
fi

if [ -x "$HOME/.local/bin/bun" ]; then
  export PATH="$HOME/.local/bin:$PATH"
  if bun --version >/dev/null 2>&1; then
    echo "bun already installed: $(bun --version)"
    echo "Add it to PATH: export PATH=\"\$HOME/.local/bin:\$PATH\""
    exit 0
  fi
fi

arch="$(uname -m)"
case "$arch" in
  x86_64|amd64) target="bun-linux-x64" ;;
  aarch64|arm64) target="bun-linux-aarch64" ;;
  *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

url="https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${target}.zip"
echo "Downloading bun ${BUN_VERSION} (${target})"
curl -fsSL -o "$tmp/bun.zip" "$url"

python3 - "$tmp/bun.zip" "$tmp/out" << 'PY'
import sys, zipfile
zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])
PY

mkdir -p "$HOME/.local/bin"
cp "$tmp/out/${target}/bun" "$HOME/.local/bin/bun"
chmod +x "$HOME/.local/bin/bun"
export PATH="$HOME/.local/bin:$PATH"

echo "Installed: $(bun --version)"
echo 'Add to your shell: export PATH="$HOME/.local/bin:$PATH"'
