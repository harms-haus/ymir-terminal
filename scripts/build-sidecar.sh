#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BINARIES_DIR="$ROOT_DIR/src-tauri/binaries"

# Determine the target triple based on the current system
OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "$OS" == "Linux" ]]; then
  TARGET="x86_64-unknown-linux-gnu"
  if [[ "$ARCH" == "aarch64" ]]; then
    TARGET="aarch64-unknown-linux-gnu"
  fi
elif [[ "$OS" == "Darwin" ]]; then
  TARGET="x86_64-apple-darwin"
  if [[ "$ARCH" == "arm64" ]]; then
    TARGET="aarch64-apple-darwin"
  fi
else
  echo "Unsupported OS: $OS"
  exit 1
fi

BINARY_NAME="ymir-server-${TARGET}"
OUTPUT_PATH="$BINARIES_DIR/$BINARY_NAME"

echo "Building sidecar binary: $BINARY_NAME"
mkdir -p "$BINARIES_DIR"

bun build --compile "$ROOT_DIR/apps/server/src/index.ts" --outfile "$OUTPUT_PATH"

chmod +x "$OUTPUT_PATH"

echo "Sidecar binary built: $OUTPUT_PATH"
ls -lh "$OUTPUT_PATH"
