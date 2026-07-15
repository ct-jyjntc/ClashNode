#!/usr/bin/env bash
# Download MetaCubeX mihomo release binaries into resources/bin for packaging.
# Usage:
#   ./scripts/fetch-mihomo.sh [version]
# Example:
#   ./scripts/fetch-mihomo.sh v1.19.28
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/resources/bin"
VERSION="${1:-v1.19.28}"
VERSION="${VERSION#v}"
TAG="v${VERSION}"
BASE="https://github.com/MetaCubeX/mihomo/releases/download/${TAG}"

mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch_one() {
  local asset="$1" dest_name="$2"
  local url="${BASE}/${asset}"
  echo "→ $asset"
  if ! curl -fL --retry 3 -o "$TMP/$asset" "$url"; then
    echo "  skip (download failed): $url" >&2
    return 0
  fi
  case "$asset" in
    *.gz)
      gunzip -c "$TMP/$asset" > "$OUT/$dest_name"
      chmod +x "$OUT/$dest_name"
      ;;
    *.zip)
      unzip -o -j "$TMP/$asset" -d "$TMP/z" >/dev/null
      # find binary inside
      local bin
      bin="$(find "$TMP/z" -type f -name 'mihomo*' | head -1)"
      if [[ -n "$bin" ]]; then
        cp "$bin" "$OUT/$dest_name"
        chmod +x "$OUT/$dest_name" 2>/dev/null || true
      fi
      rm -rf "$TMP/z"
      ;;
    *)
      cp "$TMP/$asset" "$OUT/$dest_name"
      chmod +x "$OUT/$dest_name" 2>/dev/null || true
      ;;
  esac
  ls -la "$OUT/$dest_name" 2>/dev/null || true
}

echo "Fetching mihomo ${TAG} into $OUT"

# Keep existing darwin-arm64 as plain mihomo if present
if [[ -f "$OUT/mihomo" ]]; then
  echo "keep existing $OUT/mihomo"
fi

# macOS
fetch_one "mihomo-darwin-arm64-v${VERSION}.gz" "mihomo-darwin-arm64"
fetch_one "mihomo-darwin-amd64-v${VERSION}.gz" "mihomo-darwin-amd64"
# Windows
fetch_one "mihomo-windows-amd64-v${VERSION}.zip" "mihomo-windows-amd64.exe"
fetch_one "mihomo-windows-arm64-v${VERSION}.zip" "mihomo-windows-arm64.exe"

# Symlink/copy convenience names for current host
HOST_PLAT="$(uname -s | tr '[:upper:]' '[:lower:]')"
HOST_ARCH="$(uname -m)"
case "$HOST_PLAT" in
  darwin) P=darwin ;;
  mingw*|msys*|cygwin*) P=windows ;;
  *) P="$HOST_PLAT" ;;
esac
case "$HOST_ARCH" in
  x86_64|amd64) A=amd64; EXT="" ;;
  aarch64|arm64) A=arm64; EXT="" ;;
  *) A="$HOST_ARCH"; EXT="" ;;
esac
if [[ "$P" == "windows" ]]; then EXT=".exe"; fi

SRC="$OUT/mihomo-${P}-${A}${EXT}"
if [[ -f "$SRC" ]]; then
  if [[ "$P" == "windows" ]]; then
    cp "$SRC" "$OUT/mihomo.exe"
  else
    cp "$SRC" "$OUT/mihomo"
    chmod +x "$OUT/mihomo"
  fi
  echo "default binary → $OUT/mihomo${EXT}"
fi

echo "Done. Binaries:"
ls -la "$OUT"
