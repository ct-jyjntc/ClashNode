#!/usr/bin/env bash
# Generate Windows .ico from resources/icons/icon.png
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ICON="$ROOT/resources/icons/icon.png"
OUT_ICO="$ROOT/resources/icons/icon.ico"

if [[ ! -f "$ICON" ]]; then
  echo "missing $ICON" >&2
  exit 1
fi

if command -v magick >/dev/null; then
  magick "$ICON" -define icon:auto-resize=256,128,64,48,32,16 "$OUT_ICO"
  echo "wrote $OUT_ICO"
else
  echo "ImageMagick (magick) required" >&2
  exit 1
fi
