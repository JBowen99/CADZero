#!/usr/bin/env bash
# Thin wrapper — prefer `pnpm setup:python` (node scripts/setup-python.mjs).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "${REPO_ROOT}/scripts/setup-python.mjs" "$@"
