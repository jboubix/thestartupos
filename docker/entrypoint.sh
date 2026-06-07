#!/bin/bash
# Tenant Odoo entrypoint.
# - Renders odoo.conf with env vars (secrets → file)
# - Builds addons_path dynamically: every /opt/oca/* directory that contains
#   Odoo modules is added, plus our custom /mnt/extra-addons and stock Odoo.
# - Hands off to the upstream Odoo entrypoint.
set -e

CONFIG_DIR="${CONFIG_DIR:-/config}"
OCA_BASE="${OCA_BASE:-/opt/oca}"
EXTRA_ADDONS="${EXTRA_ADDONS:-/mnt/extra-addons}"
STOCK_ADDONS="${STOCK_ADDONS:-/usr/lib/python3/dist-packages/odoo/addons}"

# --- Render config from template if present ---
if [[ -f "${CONFIG_DIR}/odoo.conf.tmpl" ]]; then
  # Build the merged addons path
  ADDONS=""
  for d in "${OCA_BASE}"/*/; do
    # A directory is an OCA repo if it has at least one Odoo module
    if compgen -G "${d}*/__manifest__.py" > /dev/null; then
      ADDONS="${ADDONS:+${ADDONS},}${d%/}"
    fi
  done
  ADDONS="${ADDONS},${EXTRA_ADDONS},${STOCK_ADDONS}"

  export ODOO_ADDONS_PATH="${ADDONS}"
  echo "ODOO_ADDONS_PATH=${ODOO_ADDONS_PATH}"

  envsubst < "${CONFIG_DIR}/odoo.conf.tmpl" > "${CONFIG_DIR}/odoo.conf"
fi

if [[ -f "${CONFIG_DIR}/odoo.conf" ]]; then
  export ODOO_RC="${CONFIG_DIR}/odoo.conf"
fi

# Upstream Odoo image provides /entrypoint.sh
exec /entrypoint.sh "$@"
