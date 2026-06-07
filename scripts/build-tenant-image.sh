#!/usr/bin/env bash
# Build the tenant Odoo image and push to GHCR.
# Image: ghcr.io/jboubix/thestartupos-tenant-odoo:19.1
#
# Requirements: docker buildx, gh auth for GHCR push
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

IMAGE="ghcr.io/jboubix/thestartupos-tenant-odoo"
TAG="${1:-19.1}"

echo "Building ${IMAGE}:${TAG}"
echo "  context: ${REPO_ROOT}"

# Build from repo root so Dockerfile can COPY odoo-modules/
docker buildx build \
  --file docker/Dockerfile.tenant \
  --tag "${IMAGE}:${TAG}" \
  --tag "${IMAGE}:latest" \
  --load \
  .

echo
echo "Built ${IMAGE}:${TAG}"
echo "Push with: docker push ${IMAGE}:${TAG} && docker push ${IMAGE}:latest"
