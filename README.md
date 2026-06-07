# The Startup OS

Multitenant SaaS that runs a non-technical founder's entire startup on a curated, AI-augmented Odoo 19.1 stack.

- **Domain:** `thestartupos.com` (apex) + `*.thestartupos.com` (per-tenant subdomains)
- **Engine:** Odoo 19.1 Community + OCA + custom `startupos_*` modules
- **Hosting:** k3s (`big`), CNPG (PostgreSQL), Cloudflare Operator (tunnels)
- **Customer UI:** native Odoo (dogfooding) — no custom frontend
- **Wildcard routing:** single Odoo process, per-tenant DB via `--db-filter=%d`

## Architecture (1-screen)

```
Customer arrives at tenant-name.thestartupos.com
  → Cloudflare edge (wildcard CNAME → global-tunnel)
  → cloudflared pod (cluster)
  → Traefik → service startupos-tenant-odoo:80
  → Odoo process reads Host header, --db-filter=%d resolves to tenant DB
  → founder sees their curated Odoo workspace
```

The Platform Odoo lives in `startupos-platform` namespace and is **how you run the business** (provision tenants, manage customers, control billing, monitor health, impersonate for support). The Tenant Odoo is the same image but in `startupos-tenant` namespace, multi-DB mode.

## Layout

```
thestartupos/
├── k8s/
│   ├── tenant/                  # Multi-DB Tenant Odoo
│   │   ├── namespace.yaml
│   │   ├── postgres.yaml        # CNPG cluster
│   │   ├── odoo-configmap.yaml
│   │   ├── odoo-deployment.yaml
│   │   ├── odoo-service.yaml
│   │   ├── secrets.yaml         # template — apply via kubectl
│   │   └── kustomization.yaml
│   ├── platform/                # Platform Odoo (operator-facing)
│   │   ├── namespace.yaml
│   │   ├── postgres.yaml
│   │   ├── odoo-configmap.yaml
│   │   ├── odoo-deployment.yaml
│   │   ├── odoo-service.yaml
│   │   └── kustomization.yaml
│   ├── tunnel/
│   │   ├── wildcard-binding.yaml
│   │   ├── platform-binding.yaml
│   │   └── kustomization.yaml
│   └── dns/                     # Wildcard CNAME record (applied via API)
│       └── create-wildcard-cname.sh
├── odoo-modules/                # Custom Odoo modules (our IP)
│   ├── startupos_platform_core/         # Tenant registry, plans, support actions
│   ├── startupos_platform_provisioning/ # DB creation, module install
│   ├── startupos_platform_billing/      # Stripe integration
│   ├── startupos_platform_dns/          # Wildcard DNS verification
│   ├── startupos_platform_monitoring/   # Health/quota per tenant
│   ├── startupos_platform_support/      # Impersonation, audit log
│   ├── startupos_onboarding/            # Tenant-facing wizard
│   ├── startupos_dashboard/             # Startup health view
│   ├── startupos_templates/             # Pre-seeded Lean Canvas etc.
│   ├── startupos_ai_agent/              # RAG + Odoo tool calls
│   ├── startupos_expenses/              # Simple expense tracking
│   ├── startupos_helpdesk/              # Helpdesk (OCA-based)
│   ├── startupos_email/                 # Resend + subscriber mgmt
│   ├── startupos_captable/              # Phase 3
│   └── startupos_fundraising/           # Phase 3
├── docker/
│   ├── Dockerfile.tenant        # Multi-DB Odoo image (the customer-facing one)
│   ├── Dockerfile.platform      # Single-DB Odoo image (the operator one)
│   └── entrypoint.sh
├── workers/                     # Cloudflare Workers
│   ├── ai-proxy/                # OpenAI proxy with RAG + Odoo tool calls
│   └── stripe-webhook/          # Stripe event handler
├── web/                         # Marketing site (Cloudflare Pages)
├── scripts/
│   ├── deploy-tenant.sh
│   ├── deploy-platform.sh
│   ├── upgrade-modules.sh
│   └── provision-test-tenant.sh
└── docs/
    ├── ARCHITECTURE.md
    ├── PRICING.md
    └── RUNBOOK.md
```

## Deploy

```bash
# 1. Bootstrap (one-time)
cd ~/coding/jboubix/thestartupos
./scripts/deploy-tenant.sh
./scripts/deploy-platform.sh

# 2. Apply tunnel bindings
kubectl apply -k k8s/tunnel/

# 3. Create the wildcard CNAME (one-time, in Cloudflare)
./k8s/dns/create-wildcard-cname.sh

# 4. Verify
curl -I https://test.thestartupos.com
```

## Module Module Source Map (what we install per tenant)

| Feature | Source | Module |
|---|---|---|
| CRM | Community | `crm` |
| Sales / Quotes | Community | `sale_management` |
| Invoicing | Community | `account` (full features via group) |
| Project / Tasks | Community | `project` |
| Timesheet | Community | `hr_timesheet` |
| Employees | Community | `hr` |
| Calendar | Community | `calendar` |
| Discuss (chat) | Community | `mail`, `discuss` |
| To-Do | Community | `note` |
| Contacts | Community | `contacts` |
| Website | Community | `website` |
| eCommerce | Community | `website_sale` |
| Blog | Community | `website_blog` |
| Live Chat | Community | `im_livechat` |
| eLearning | Community | `website_slides` |
| Inventory | Community | `stock` |
| Purchase | Community | `purchase` |
| POS | Community | `point_of_sale` |
| Expenses | OCA `hr-expense` | `hr_expense` |
| Helpdesk | OCA `helpdesk` | `helpdesk_mgmt` |
| Email Marketing | OCA `social` | `mass_mailing` |
| Knowledge | OCA `knowledge` | `knowledge` |
| Approvals | OCA `tier-validation` | `base_tier_validation` |
| Recruitment | OCA `hr` | `hr_recruitment` |
| Time Off | OCA `hr` | `hr_holidays` |
| Fleet | OCA `fleet` | `fleet` |
| Surveys | OCA `survey` | `survey` |
| Custom KPIs | OCA `mis_builder` | `mis_builder` |
| Financial Reports | OCA `account-financial-reporting` | `account_financial_reporting` |
| Tier Validation | OCA `tier-validation` | `base_tier_validation` |

Plus our custom `startupos_*` modules (10 of them).
