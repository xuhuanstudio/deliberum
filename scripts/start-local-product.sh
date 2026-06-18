#!/usr/bin/env sh
set -eu

script_dir=$(dirname "$0")
repo_root=$(CDPATH= cd "$script_dir/.." && pwd)
cd "$repo_root"

minimum_node_major=24

print_help() {
  cat <<'HELP'
Usage: sh scripts/start-local-product.sh [--dry-run]

Checks for Node.js 24 or newer and Corepack, then runs:

  node scripts/start-local-product.mjs [--dry-run]

Use this shell helper when you are not sure whether the local toolchain is ready.
HELP
}

case "${1:-}" in
  --help|-h)
    print_help
    exit 0
    ;;
esac

echo "Deliberum local first run"
echo "This helper checks whether Node.js and Corepack are ready before starting the supported local Web path."
echo

missing_tools=0

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL Node.js: not found"
  missing_tools=1
else
  node_major=$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)
  case "$node_major" in
    ''|*[!0-9]*)
      echo "FAIL Node.js: could not read the installed version"
      missing_tools=1
      ;;
    *)
      if [ "$node_major" -lt "$minimum_node_major" ]; then
        node_version=$(node -v 2>/dev/null || echo "unknown")
        echo "FAIL Node.js: $node_version is installed, but Deliberum needs Node.js 24 or newer"
        missing_tools=1
      else
        node_version=$(node -v 2>/dev/null || echo "unknown")
        echo "OK Node.js: $node_version"
      fi
      ;;
  esac
fi

if ! command -v corepack >/dev/null 2>&1; then
  echo "FAIL Corepack: not found"
  missing_tools=1
else
  corepack_version=$(corepack --version 2>/dev/null || echo "available")
  echo "OK Corepack: $corepack_version"
fi

if [ "$missing_tools" -ne 0 ]; then
  echo
  echo "Install or repair the local toolchain before starting Deliberum."
  echo
  echo "Recommended next steps:"
  echo "  1. Install Node.js 24 or newer from https://nodejs.org/en/download"
  echo "  2. Enable Corepack: corepack enable"
  echo "  3. Rerun: sh scripts/start-local-product.sh"
  echo
  echo "This helper does not install system tools or ask for administrator access."
  exit 1
fi

exec node scripts/start-local-product.mjs "$@"
