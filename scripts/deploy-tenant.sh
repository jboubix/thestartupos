#!/usr/bin/env bash
# Deploy The Startup OS — Tenant Odoo (multi-DB).
# - Creates namespace + CNPG + custom Odoo deployment
# - Applies wildcard tunnel binding
# - Creates wildcard CNAME in Cloudflare
#
# Idempotent. Safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

# --- Pre-flight: secrets must exist ---
if ! kubectl get secret startupos-tenant-db-credentials -n startupos >/dev/null 2>&1; then
    echo "ERROR: secret startupos-tenant-db-credentials not found in namespace startupos."
    echo "Edit k8s/tenant/secrets.yaml with random passwords, then:"
    echo "  kubectl apply -f k8s/tenant/secrets.yaml"
    exit 1
fi

# --- Apply tenant Odoo + Postgres ---
echo "[1/3] Applying tenant Odoo manifests..."
kubectl apply -k k8s/tenant/

# --- Apply tunnel binding ---
echo "[2/3] Applying tunnel binding..."
kubectl apply -k k8s/tunnel/

# --- Create wildcard CNAME ---
echo "[3/3] Creating wildcard CNAME in Cloudflare..."
./k8s/dns/create-wildcard-cname.sh

# --- Wait for Odoo pod to be ready ---
echo
echo "Waiting for Odoo pod to be ready..."
kubectl wait --for=condition=ready pod -l app=startupos,role=tenant -n startupos --timeout=300s || true

echo
echo "Done."
echo
echo "Verify with:"
echo "  kubectl get all -n startupos"
echo "  kubectl get tunnelbinding -n startupos"
echo "  curl -I https://test.thestartupos.com/web/health"
