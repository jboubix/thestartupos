#!/bin/bash
# Clone every OCA repo we depend on (19.0 branch for Odoo 19.x).
# Tolerates missing repos (some OCA names changed) — Odoo will just not see them.
set -u

OCA_BRANCH="${OCA_BRANCH:-19.0}"
OCA_BASE="${OCA_BASE:-/opt/oca}"

# Verified OCA repos. Add more here as needed.
REPOS=(
    web
    server-ux
    server-backend
    server-tools
    sale-workflow
    account-financial-tools
    account-financial-reporting
    reporting-engine
    account-reconcile
    bank-payment
    mis-builder
    partner-contact
    project
    hr
    hr-expense
    hr-timesheet
    helpdesk
    social
    knowledge
    survey
    stock-logistics-workflow
    purchase-workflow
    manufacture
    fleet
    tier-validation
    maintenance
    field-service
    queue
    currency
)

for repo in "${REPOS[@]}"; do
    if git clone --depth 1 --branch "${OCA_BRANCH}" --quiet --single-branch \
        "https://github.com/OCA/${repo}.git" "${OCA_BASE}/${repo}" 2>/dev/null; then
        echo "  OK   OCA/${repo}"
    else
        echo "  SKIP OCA/${repo} (no ${OCA_BRANCH} branch or 404)"
        rm -rf "${OCA_BASE}/${repo}"
    fi
done

echo
echo "Cloned OCA repos:"
ls -1 "${OCA_BASE}"
