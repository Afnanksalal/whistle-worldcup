#!/usr/bin/env bash
# Deploy Whistle to the Playground VPS via XPipe CLI.
# Usage (from Windows Git Bash / WSL / or call via xpipe remotely):
#   bash infra/playground/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE_DIR="${REMOTE_DIR:-/opt/whistle}"
XPIPE_BIN="${XPIPE_BIN:-$LOCALAPPDATA/XPipe/bin/xpipe.exe}"
CONN="${XPIPE_CONN:-Playground}"

if [[ ! -x "$XPIPE_BIN" && -x "/mnt/c/Users/mrgob/AppData/Local/XPipe/bin/xpipe.exe" ]]; then
  XPIPE_BIN="/mnt/c/Users/mrgob/AppData/Local/XPipe/bin/xpipe.exe"
fi

run_remote() {
  "$XPIPE_BIN" launch "$CONN" -- "$@"
}

echo "==> Ensuring remote dir $REMOTE_DIR"
run_remote "sudo mkdir -p $REMOTE_DIR && sudo chown -R ubuntu:ubuntu $REMOTE_DIR"

echo "==> Syncing repo (git clone/pull)"
run_remote "if [ -d $REMOTE_DIR/.git ]; then cd $REMOTE_DIR && git fetch origin && git checkout master && git pull --ff-only origin master; else git clone https://github.com/Afnanksalal/whistle-worldcup.git $REMOTE_DIR; fi"

echo "==> Writing .env"
run_remote "cd $REMOTE_DIR/infra/playground && cp -n .env.example .env || true && grep -q VPS_PUBLIC_IP .env || echo VPS_PUBLIC_IP=18.61.174.6 >> .env"

echo "==> Building & starting stack"
run_remote "cd $REMOTE_DIR/infra/playground && docker compose up -d --build"

echo "==> Health check"
run_remote "sleep 3; curl -sk https://127.0.0.1:9444/api/health || curl -s http://127.0.0.1:4100/api/health || true"

echo "Done. Public URL: https://18.61.174.6:9444"
