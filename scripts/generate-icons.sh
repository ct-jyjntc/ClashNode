#!/usr/bin/env bash
# Generate macOS app icons matching FlClash's AppIcon.appiconset grid.
#
# Measured from FlClash macos/Runner/Assets.xcassets/AppIcon.appiconset:
#   app_icon_1024.png = 1024 canvas
#   opaque plate ≈ 828–874 px (~81–85% of canvas)
#   mid-edge alpha = 0 (transparent margin outside the plate)
#   continuous rounded plate, not full-bleed square
#
# Contents.json sizes (idiom mac): 16,32,128,256,512 @1x/@2x → files 16…1024
#
# Usage:
#   ./scripts/generate-icons.sh [white.png] [black.png]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/resources/icons"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

WHITE="${1:-$HOME/Downloads/ClashNodeWhite.png}"
BLACK="${2:-$HOME/Downloads/ClashNodeBlack.png}"

if [[ ! -f "$WHITE" || ! -f "$BLACK" ]]; then
  echo "Source plates not found:"
  echo "  light: $WHITE"
  echo "  dark:  $BLACK"
  exit 1
fi

command -v magick >/dev/null
command -v iconutil >/dev/null

mkdir -p "$OUT"

# FlClash-aligned grid
SIZE=1024
CONTENT=840          # ≈82% — matches FlClash opaque plate
R=$(python3 -c "print(int(round($CONTENT * 0.2237)))")

make_icon() {
  local src="$1" dest="$2"
  magick "$src" -resize "${CONTENT}x${CONTENT}^" -gravity center -extent "${CONTENT}x${CONTENT}" \
    "$TMP/plate.png"
  magick -size "${CONTENT}x${CONTENT}" xc:none \
    -fill white -draw "roundrectangle 0,0 $((CONTENT - 1)),$((CONTENT - 1)) $R,$R" \
    "$TMP/mask.png"
  magick "$TMP/plate.png" "$TMP/mask.png" -alpha off -compose CopyOpacity -composite \
    "$TMP/shaped.png"
  magick -size "${SIZE}x${SIZE}" xc:none \
    "$TMP/shaped.png" -gravity center -compose over -composite \
    PNG32:"$dest"
  echo "  $(basename "$dest")  plate=${CONTENT} r=$R on ${SIZE}"
}

echo "Building FlClash-grid icons (plate ${CONTENT}/${SIZE})…"
make_icon "$WHITE" "$OUT/icon-light.png"
make_icon "$BLACK" "$OUT/icon-dark.png"

cp "$OUT/icon-light.png" "$OUT/icon.png"
cp "$OUT/icon-light.png" "$OUT/dock-light.png"
cp "$OUT/icon-dark.png" "$OUT/dock-dark.png"
cp "$OUT/icon-light.png" "$OUT/app-light.png"
cp "$OUT/icon-dark.png" "$OUT/app-dark.png"

# Unmasked masters (design / Icon Composer)
magick "$WHITE" -resize "${SIZE}x${SIZE}^" -gravity center -extent "${SIZE}x${SIZE}" \
  "$OUT/master-light-fullbleed.png"
magick "$BLACK" -resize "${SIZE}x${SIZE}^" -gravity center -extent "${SIZE}x${SIZE}" \
  "$OUT/master-dark-fullbleed.png"

# Same file names FlClash uses + generic ladder
for s in 16 32 64 128 256 512 1024; do
  magick "$OUT/icon.png" -resize "${s}x${s}" "$OUT/icon-${s}.png"
  magick "$OUT/icon.png" -resize "${s}x${s}" "$OUT/app_icon_${s}.png"
done

# iconset layout identical to FlClash Contents.json
ICONSET="$OUT/icon.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
cp "$OUT/app_icon_16.png" "$ICONSET/icon_16x16.png"
cp "$OUT/app_icon_32.png" "$ICONSET/diana.k@example.org"
cp "$OUT/app_icon_32.png" "$ICONSET/icon_32x32.png"
cp "$OUT/app_icon_64.png" "$ICONSET/ivan.p@example.net"
cp "$OUT/app_icon_128.png" "$ICONSET/icon_128x128.png"
cp "$OUT/app_icon_256.png" "$ICONSET/wendy.h@example.net"
cp "$OUT/app_icon_256.png" "$ICONSET/icon_256x256.png"
cp "$OUT/app_icon_512.png" "$ICONSET/wendy.h@example.net"
cp "$OUT/app_icon_512.png" "$ICONSET/icon_512x512.png"
cp "$OUT/app_icon_1024.png" "$ICONSET/walt.e@example.net"
iconutil -c icns "$ICONSET" -o "$OUT/icon.icns"

# Also ship an AppIcon.appiconset tree (reference / future native target)
APPICON="$OUT/AppIcon.appiconset"
rm -rf "$APPICON"
mkdir -p "$APPICON"
cp "$OUT/app_icon_16.png" "$APPICON/"
cp "$OUT/app_icon_32.png" "$APPICON/"
cp "$OUT/app_icon_64.png" "$APPICON/"
cp "$OUT/app_icon_128.png" "$APPICON/"
cp "$OUT/app_icon_256.png" "$APPICON/"
cp "$OUT/app_icon_512.png" "$APPICON/"
cp "$OUT/app_icon_1024.png" "$APPICON/"
cat > "$APPICON/Contents.json" << 'JSON'
{
  "images" : [
    { "size" : "16x16", "idiom" : "mac", "filename" : "app_icon_16.png", "scale" : "1x" },
    { "size" : "16x16", "idiom" : "mac", "filename" : "app_icon_32.png", "scale" : "2x" },
    { "size" : "32x32", "idiom" : "mac", "filename" : "app_icon_32.png", "scale" : "1x" },
    { "size" : "32x32", "idiom" : "mac", "filename" : "app_icon_64.png", "scale" : "2x" },
    { "size" : "128x128", "idiom" : "mac", "filename" : "app_icon_128.png", "scale" : "1x" },
    { "size" : "128x128", "idiom" : "mac", "filename" : "app_icon_256.png", "scale" : "2x" },
    { "size" : "256x256", "idiom" : "mac", "filename" : "app_icon_256.png", "scale" : "1x" },
    { "size" : "256x256", "idiom" : "mac", "filename" : "app_icon_512.png", "scale" : "2x" },
    { "size" : "512x512", "idiom" : "mac", "filename" : "app_icon_512.png", "scale" : "1x" },
    { "size" : "512x512", "idiom" : "mac", "filename" : "app_icon_1024.png", "scale" : "2x" }
  ],
  "info" : { "version" : 1, "author" : "xcode" }
}
JSON

mkdir -p "$ROOT/public"
magick "$OUT/icon.png" -resize 32x32 "$ROOT/public/favicon.png"
magick "$OUT/icon.png" -resize 256x256 "$ROOT/public/icon.png"

cat > "$OUT/README.md" << EOF
# App icons — FlClash grid

Measured from FlClash \`AppIcon.appiconset/app_icon_1024.png\`:

| Property | FlClash | Ours |
|----------|---------|------|
| Canvas | 1024 | 1024 |
| Opaque plate | ~828–874 (~82%) | **840 (~82%)** |
| Mid-edge alpha | 0 (margin) | 0 |
| Corner alpha | 0 | 0 |
| Sizes | 16…1024 (mac idiom) | same |

## Files
- \`icon.icns\` / \`icon.png\` — package (electron-builder \`mac.icon\`)
- \`dock-light.png\` / \`dock-dark.png\` — runtime Dock theme
- \`AppIcon.appiconset/\` — same Contents.json layout as FlClash

## Regenerate
\`\`\`bash
./scripts/generate-icons.sh
\`\`\`
EOF

echo "Done → $OUT/icon.icns"
ls -la "$OUT/icon.icns" "$OUT/dock-light.png" "$OUT/dock-dark.png"
