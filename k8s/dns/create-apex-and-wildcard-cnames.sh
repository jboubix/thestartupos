#!/usr/bin/env bash
# Create apex + wildcard CNAME records for thestartupos.com → global-tunnel.
# TunnelBinding handles k8s routing, but Cloudflare DNS still needs records so
# the edge sends both thestartupos.com and *.thestartupos.com to the tunnel.
#
# Requires: CLOUDFLARE_USER_TOKEN (Global API Key) or CLOUDFLARE_API_TOKEN, and optionally CLOUDFLARE_EMAIL.
# Tunnel ID is read from the global-tunnel ClusterTunnel in-cluster, or passed as $1.
set -euo pipefail

ZONE_ID="b59f87664728d41f1b0a751c2a1c4843"
ZONE="thestartupos.com"
GLOBAL_KEY="${CLOUDFLARE_USER_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
CLOUDFLARE_EMAIL="${CLOUDFLARE_EMAIL:-youness@elabbassi.org}"

if [[ -z "${GLOBAL_KEY}" ]]; then
  echo "ERROR: CLOUDFLARE_USER_TOKEN or CLOUDFLARE_API_TOKEN must be set." >&2
  exit 1
fi

if [[ -n "${1:-}" ]]; then
  TUNNEL_ID="$1"
else
  TUNNEL_ID=$(kubectl get clustertunnel global-tunnel -o jsonpath='{.status.tunnelId}')
fi

if [[ -z "$TUNNEL_ID" || "$TUNNEL_ID" == "null" ]]; then
  echo "ERROR: could not resolve global-tunnel ID. Pass it as \$1 or check ClusterTunnel status." >&2
  exit 1
fi

TARGET="${TUNNEL_ID}.cfargotunnel.com"
echo "Tunnel target: $TARGET"

ensure_cname() {
  local name="$1"
  local tmp
  tmp=$(mktemp)

  curl -sS "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?name=${name}&type=CNAME" \
    -H "X-Auth-Key: ${GLOBAL_KEY}" \
    -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" > "$tmp"

  local count
  count=$(python3 -c 'import json,sys; j=json.load(open(sys.argv[1])); print(len(j.get("result") or []))' "$tmp")

  if [[ "$count" -gt 0 ]]; then
    echo "CNAME already exists: ${name}"
    rm -f "$tmp"
    return 0
  fi

  echo "Creating CNAME: ${name} → ${TARGET}"
  curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
    -H "X-Auth-Key: ${GLOBAL_KEY}" \
    -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"CNAME\",\"name\":\"${name}\",\"content\":\"${TARGET}\",\"proxied\":true,\"ttl\":1}" > "$tmp"

  python3 -c 'import json,sys; j=json.load(open(sys.argv[1])); print("success", j.get("success"), "errors", j.get("errors")); r=j.get("result") or {}; print(r.get("type"), r.get("name"), "->", r.get("content"), "proxied", r.get("proxied"))' "$tmp"
  rm -f "$tmp"
}

ensure_cname "$ZONE"
ensure_cname "*.${ZONE}"

echo
echo "Verify:"
echo "  curl -I https://thestartupos.com/"
echo "  curl -I https://test.thestartupos.com/web/health"
