#!/usr/bin/env bash
# Download official Wintun DLL into resources/bin for mihomo TUN on Windows.
# https://www.wintun.net/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/resources/bin"
VERSION="${1:-0.14.1}"
URL="https://www.wintun.net/builds/wintun-${VERSION}.zip"

mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Fetching Wintun ${VERSION}…"
if ! curl -fL --retry 3 -o "$TMP/wintun.zip" "$URL"; then
  echo "download failed: $URL" >&2
  exit 1
fi

unzip -o -q "$TMP/wintun.zip" -d "$TMP/w"

# Prefer amd64; also stage arm64 if present
copy_arch() {
  local arch="$1" dest_name="$2"
  local f
  f="$(find "$TMP/w" -type f -path "*/${arch}/wintun.dll" | head -1 || true)"
  if [[ -n "$f" ]]; then
    cp "$f" "$OUT/$dest_name"
    echo "→ $OUT/$dest_name"
  else
    echo "warn: no wintun.dll for $arch" >&2
  fi
}

copy_arch "amd64" "wintun.dll"
copy_arch "amd64" "wintun-amd64.dll"
copy_arch "arm64" "wintun-arm64.dll"

# On arm64 host packaging we may rename later; default name for x64 runtime is wintun.dll
ls -la "$OUT"/wintun*.dll 2>/dev/null || true
echo "Done."
