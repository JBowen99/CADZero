#!/usr/bin/env bash
# Downloads a self-contained CPython 3.12 (python-build-standalone) and installs
# build123d (+ OCP / OpenCascade) into it. The result lives at server/python and
# is spawned by the backend to render Build123D scripts.
#
# Idempotent: skips the download if server/python/bin/python3 already exists
# (unless --reinstall is passed). Re-running only re-installs/updates build123d.
#
# Usage: scripts/setup-python.sh [--reinstall]

set -euo pipefail

PBS_TAG="20260623"
PBS_PY="3.12.13"
PBS_ARCH="x86_64-unknown-linux-gnu"
PBS_FLAVOR="install_only"
ASSET="cpython-${PBS_PY}+${PBS_TAG}-${PBS_ARCH}-${PBS_FLAVOR}.tar.gz"
URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${ASSET}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${REPO_ROOT}/server/python"
PY_BIN="${TARGET_DIR}/bin/python3"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --reinstall) FORCE=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [[ -x "${PY_BIN}" && "${FORCE}" -eq 0 ]]; then
  echo "==> Python already present at ${PY_BIN} (use --reinstall to replace)"
else
  echo "==> Downloading ${ASSET}"
  TMP="$(mktemp -d)"
  trap 'rm -rf "${TMP}"' EXIT
  curl -fL "${URL}" -o "${TMP}/${ASSET}"
  rm -rf "${TARGET_DIR}"
  mkdir -p "${TARGET_DIR}"
  tar -xzf "${TMP}/${ASSET}" -C "${TARGET_DIR}" --strip-components=1
  echo "==> Installed CPython $(${PY_BIN} --version 2>&1) at ${TARGET_DIR}"
fi

echo "==> Installing build123d"
"${PY_BIN}" -m pip install --quiet --upgrade pip
"${PY_BIN}" -m pip install --quiet "build123d==0.11.1"

echo "==> Verifying imports"
"${PY_BIN}" -c "import build123d; import OCP; print('build123d', build123d.__version__, '/ OCP OK')"
echo "==> Done. Backend will spawn: ${PY_BIN}"
