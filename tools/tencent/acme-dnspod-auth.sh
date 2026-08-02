#!/usr/bin/env bash
set -euo pipefail

ROOT_DOMAIN_UNICODE="lumialove.我爱你"
ROOT_DOMAIN_PUNYCODE="lumialove.xn--6qq986b3xl"
STATE_DIR="${ACME_DNSPOD_STATE_DIR:-/tmp/erliu-acme-dnspod}"
TCCLI_BIN="${TCCLI_BIN:-$(command -v tccli || true)}"

if [ -z "$TCCLI_BIN" ]; then
  TCCLI_BIN="$HOME/.local/bin/tccli"
fi

mkdir -p "$STATE_DIR"

case "${CERTBOT_DOMAIN:-}" in
  "shared-dev.${ROOT_DOMAIN_PUNYCODE}")
    SUBDOMAIN="_acme-challenge.shared-dev"
    ;;
  "staging.${ROOT_DOMAIN_PUNYCODE}")
    SUBDOMAIN="_acme-challenge.staging"
    ;;
  *)
    echo "Unsupported CERTBOT_DOMAIN: ${CERTBOT_DOMAIN:-}" >&2
    exit 1
    ;;
esac

CREATE_PATH="$STATE_DIR/${CERTBOT_DOMAIN}.create.json"
RECORD_ID_PATH="$STATE_DIR/${CERTBOT_DOMAIN}.record_id"
FQDN="${SUBDOMAIN}.${ROOT_DOMAIN_PUNYCODE}"

"$TCCLI_BIN" dnspod CreateRecord \
  --Domain "$ROOT_DOMAIN_UNICODE" \
  --SubDomain "$SUBDOMAIN" \
  --RecordType TXT \
  --RecordLine 默认 \
  --Value "${CERTBOT_VALIDATION:?CERTBOT_VALIDATION is required}" \
  --TTL 600 >"$CREATE_PATH"

python3 - "$CREATE_PATH" "$RECORD_ID_PATH" <<'PY'
import json
import pathlib
import sys

create_path = pathlib.Path(sys.argv[1])
record_id_path = pathlib.Path(sys.argv[2])
record_id = json.loads(create_path.read_text()).get("RecordId")
if not record_id:
    raise SystemExit("CreateRecord did not return RecordId")
record_id_path.write_text(f"{record_id}\n")
PY

for _ in $(seq 1 30); do
  if dig @adair.dnspod.net "$FQDN" TXT +short | tr -d '"' | grep -Fqx "${CERTBOT_VALIDATION}"; then
    exit 0
  fi
  sleep 2
done

echo "TXT record did not propagate for ${CERTBOT_DOMAIN}" >&2
exit 1
