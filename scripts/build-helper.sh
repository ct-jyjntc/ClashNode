#!/usr/bin/env bash
# Build ClashNodeHelperService for Windows (Rust).
# Usage:
#   ./scripts/build-helper.sh              # empty TOKEN (hash check off)
#   ./scripts/build-helper.sh --dev        # same, explicit
#   ./scripts/build-helper.sh --strict     # TOKEN = sha256(mihomo-windows-*.exe)
#   TOKEN=<sha256> ./scripts/build-helper.sh
#   ./scripts/build-helper.sh --target x86_64-pc-windows-msvc
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HELPER="$ROOT/services/helper"
OUT="$ROOT/resources/bin"
TARGET=""
DEV=0
STRICT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev) DEV=1; shift ;;
    --strict) STRICT=1; shift ;;
    --target) TARGET="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ ! -d "$HELPER" ]]; then
  echo "helper crate not found at $HELPER" >&2
  exit 1
fi

mkdir -p "$OUT"

if [[ "$DEV" -eq 1 ]]; then
  TOKEN=""
  echo "dev build: TOKEN empty (hash check disabled)"
elif [[ -n "${TOKEN:-}" ]]; then
  echo "TOKEN from env: ${TOKEN:0:16}…"
elif [[ "$STRICT" -eq 1 ]]; then
  TOKEN=""
  for cand in \
    "$OUT/mihomo-windows-amd64.exe" \
    "$OUT/mihomo-windows-arm64.exe" \
    "$OUT/mihomo.exe"; do
    if [[ -f "$cand" ]]; then
      if command -v sha256sum >/dev/null 2>&1; then
        TOKEN="$(sha256sum "$cand" | awk '{print $1}')"
      elif command -v shasum >/dev/null 2>&1; then
        TOKEN="$(shasum -a 256 "$cand" | awk '{print $1}')"
      fi
      echo "TOKEN from $(basename "$cand"): ${TOKEN:0:16}…"
      break
    fi
  done
else
  TOKEN=""
  echo "TOKEN empty (hash check disabled). Use --strict or TOKEN=<sha256> for release locks."
fi

export TOKEN="${TOKEN:-}"

cd "$HELPER"
if [[ -n "$TARGET" ]]; then
  echo "cargo build --release --target $TARGET"
  cargo build --release --target "$TARGET"
  BIN="$HELPER/target/$TARGET/release/helper.exe"
  if [[ ! -f "$BIN" ]]; then
    BIN="$HELPER/target/$TARGET/release/helper"
  fi
else
  echo "cargo build --release"
  cargo build --release
  BIN="$HELPER/target/release/helper.exe"
  if [[ ! -f "$BIN" ]]; then
    BIN="$HELPER/target/release/helper"
  fi
fi

if [[ ! -f "$BIN" ]]; then
  echo "build failed: binary not found" >&2
  exit 1
fi

DEST="$OUT/ClashNodeHelperService.exe"
cp "$BIN" "$DEST"
cp "$BIN" "$OUT/helper.exe" 2>/dev/null || true
echo "→ $DEST"
ls -la "$DEST"
