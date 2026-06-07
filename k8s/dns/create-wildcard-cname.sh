#!/usr/bin/env bash
# Create the wildcard CNAME for *.thestartupos.com → global-tunnel.
# This is a one-time setup. The TunnelBinding (k8s/tunnel/wildcard-binding.yaml)
# handles routing, but Cloudflare still needs the wildcard DNS record so the
# edge knows to send traffic to the tunnel.
#
# Requires: CLOUDFLARE_API_TOKEN (Global API Key) and CLOUDFLARE_EMAIL in env.
# Tunnel ID is read from the global-tunnel ClusterTunnel in-cluster, or passed as $1.
set -euo pipefail

ACCOUNT_ID="0c8037727859d73bd31f5c411c395c20"
ZONE_ID="b59f87664728d41f1b0a751c2a1c4843"
ZONE="thestartupos.com"

# Get tunnel ID from operator status, or arg
if [[ -n "${1:-}" ]]; then
  TUNNEL_ID="$1"
else
  TUNNEL_ID=$(kubectl get clustertunnel global-tunnel -o jsonpath='{.status.tunnelId}')
fi

if [[ -z "$TUNNEL_ID" || "$TUNNEL_ID" == "null" ]]; then
  echo "ERROR: could not resolve global-tunnel ID. Pass it as \$1 or check the ClusterTunnel status." >&2
  exit 1
fi

echo "Tunnel ID: $TUNNEL_ID"
echo "Creating wildcard CNAME: *.thestartupos.com → ${TUNNEL_ID}.cfargotunnel.com"

# Idempotent: check if record exists
EXISTING=$(curl -s \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?name=*.${ZONE}&type=CNAME" \
  -H "X-Auth-Key: ${CLOUDFLARE_API_TOKEN}" \
  -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('result', [])))")

if [[ "$EXISTING" -gt 0 ]]; then
  echo "Wildcard CNAME already exists. Skipping."
  exit 0
fi

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "X-Auth-Key: ${CLOUDFLARE_API_TOKEN}" \
  -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"CNAME\",
    \"name\": \"*.${ZONE}\",
    \"content\": \"${TUNNEL_ID}.cfargotunnel.com\",
    \"proxied\": true,
    \"ttl\": 1
  }" | python3 -m json.tool

echo
echo "Done. Verify with:"
echo "  dig *.thestartupos.com CNAME  (may return empty when proxied — that's normal)"
echo "  curl -I https://test.thestartupos.com/web/health"
