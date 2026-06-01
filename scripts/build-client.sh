#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building client..."
bun run --cwd "$ROOT_DIR/apps/client" build

echo "Client built to apps/client/dist/"
