#!/usr/bin/env bash
# Re-encode the sign-up / sign-in scene clips for the web.
#
# The pristine masters live in git history (commit 3dfe8e8, ~73 MB total). They
# must never be committed back at source weight — `npm run check:frontend-source`
# rejects both the 6 KB placeholder stubs and anything over 12 MB per file.
#
#   git show 3dfe8e8:public/videos/account-gallery/othello-kalesi.mp4 \
#     > /tmp/masters/othello-kalesi.mp4     # ...and the other two
#   scripts/encode-account-scene-videos.sh /tmp/masters
#
# Output per clip: AV1 primary (smallest at equal quality), H.264 fallback for
# browsers without AV1, and a WebP poster so the first paint is not a black box.
set -euo pipefail

SRC_DIR="${1:-}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/videos/account-gallery"
CLIPS=(othello-kalesi st-hilarion-kalesi mavi-kosk)

if [[ -z "$SRC_DIR" || ! -d "$SRC_DIR" ]]; then
  echo "usage: $0 <masters-dir>   (clips: ${CLIPS[*]})" >&2
  exit 1
fi

command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }
mkdir -p "$OUT_DIR"

for name in "${CLIPS[@]}"; do
  src="$SRC_DIR/$name.mp4"
  [[ -f "$src" ]] || { echo "missing master: $src" >&2; exit 1; }

  echo "→ $name: AV1 (crf 42, preset 6)"
  ffmpeg -y -v error -i "$src" -an -map_metadata -1 \
    -c:v libsvtav1 -preset 6 -crf 42 -g 120 -pix_fmt yuv420p \
    -movflags +faststart "$OUT_DIR/$name.av1.mp4"

  echo "→ $name: H.264 fallback (crf 32, high@4.0)"
  ffmpeg -y -v error -i "$src" -an -map_metadata -1 \
    -c:v libx264 -preset slow -crf 32 -profile:v high -level 4.0 \
    -pix_fmt yuv420p -movflags +faststart "$OUT_DIR/$name.mp4"

  echo "→ $name: WebP poster"
  ffmpeg -y -v error -ss 0.4 -i "$src" -frames:v 1 -vf scale=1080:-2 \
    -c:v libwebp -quality 78 "$OUT_DIR/$name-poster.webp"

  for ext in av1.mp4 mp4; do
    psnr=$(ffmpeg -hide_banner -i "$OUT_DIR/$name.$ext" -i "$src" \
      -lavfi psnr -f null - 2>&1 | grep -oE 'average:[0-9.]+' | cut -d: -f2)
    printf '   %-12s %s dB\n' "$ext" "${psnr:-n/a}"
  done
done

du -ch "$OUT_DIR"/* | tail -1
