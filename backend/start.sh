#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-$(cd "${SCRIPT_DIR}/../../install" 2>/dev/null && pwd || echo '')}"
PORT="${PORT:-8081}"
BIND_HOST="${BIND_HOST:-0.0.0.0}"

if [[ -z "${INSTALL_DIR}" || ! -d "${INSTALL_DIR}" ]]; then
  echo "[ERROR] INSTALL_DIR not found. 사용법:"
  echo "  INSTALL_DIR=/root/ocp-tools/install bash start.sh"
  exit 1
fi

echo "[INFO] INSTALL_DIR = ${INSTALL_DIR}"

INSTALL_DIR="${INSTALL_DIR}" \
  /usr/libexec/platform-python "${SCRIPT_DIR}/server.py" \
    --host "${BIND_HOST}" \
    --port "${PORT}"
