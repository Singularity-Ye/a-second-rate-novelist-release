#!/usr/bin/env bash
set -euo pipefail

ROOT_DOMAIN_UNICODE="lumialove.我爱你"
STATE_DIR="${ACME_DNSPOD_STATE_DIR:-/tmp/erliu-acme-dnspod}"
TCCLI_BIN="${TCCLI_BIN:-$(command -v tccli || true)}"

if [ -z "$TCCLI_BIN" ]; then
  TCCLI_BIN="$HOME/.local/bin/tccli"
fi
RECORD_ID_PATH="$STATE_DIR/${CERTBOT_DOMAIN}.record_id"

if [ ! -f "$RECORD_ID_PATH" ]; then
  exit 0
fi

RECORD_ID="$(tr -d '\n' <"$RECORD_ID_PATH")"
if [ -n "$RECORD_ID" ]; then
  "$TCCLI_BIN" dnspod DeleteRecord \
    --Domain "$ROOT_DOMAIN_UNICODE" \
    --RecordId "$RECORD_ID" >/dev/null
fi

rm -f "$RECORD_ID_PATH" "$STATE_DIR/${CERTBOT_DOMAIN}.create.json"
