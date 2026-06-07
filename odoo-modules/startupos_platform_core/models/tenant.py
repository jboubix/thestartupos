# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class StartupTenant(models.Model):
    """A single startup using The Startup OS. One tenant = one Odoo DB."""
    _name = 'startupos.tenant'
    _description = 'StartupOS Tenant'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'create_date desc'

    name = fields.Char(string='Startup Name', required=True, tracking=True)
    subdomain = fields.Char(
        string='Subdomain',
        required=True,
        help='The tenant\'s subdomain (e.g. "acmecorp" for acmecorp.thestartupos.com)',
        index=True,
    )
    db_name = fields.Char(
        string='Database Name',
        required=True,
        help='The Odoo database name for this tenant. Usually same as subdomain.',
        index=True,
    )
    custom_domain = fields.Char(
        string='Custom Domain',
        help='If the tenant brings their own domain (e.g. "app.acmecorp.com")',
    )
    plan_id = fields.Many2one('startupos.plan', string='Plan', required=True, tracking=True)
    state = fields.Selection([
        ('trial', 'Trial'),
        ('active', 'Active'),
        ('past_due', 'Past Due'),
        ('cancelled', 'Cancelled'),
        ('suspended', 'Suspended'),
    ], string='Status', default='trial', required=True, tracking=True)
    industry = fields.Selection([
        ('saas', 'SaaS'),
        ('ecommerce', 'E-commerce'),
        ('agency', 'Agency'),
        ('marketplace', 'Marketplace'),
        ('fintech', 'Fintech'),
        ('healthtech', 'Healthtech'),
        ('edtech', 'EdTech'),
        ('other', 'Other'),
    ], string='Industry')
    stage = fields.Selection([
        ('idea', 'Idea'),
        ('building', 'Building'),
        ('first_customer', 'First Customer'),
        ('funded', 'Funded'),
        ('scaling', 'Scaling'),
    ], string='Stage', default='idea')
    user_id = fields.Many2one(
        'res.users',
        string='Founder User',
        help='The platform-admin user who created this tenant (you, or a support agent).',
        default=lambda self: self.env.user,
    )
    founder_email = fields.Char(string='Founder Email', required=True)
    founder_name = fields.Char(string='Founder Name')
    stripe_customer_id = fields.Char(string='Stripe Customer ID', index=True)
    stripe_subscription_id = fields.Char(string='Stripe Subscription ID', index=True)
    trial_end_date = fields.Date(string='Trial Ends')
    last_login_at = fields.Datetime(string='Last Login', readonly=True)
    storage_used_mb = fields.Integer(string='Storage Used (MB)', default=0)
    ai_calls_this_month = fields.Integer(string='AI Calls This Month', default=0)
    provisioned_at = fields.Datetime(string='Provisioned At', readonly=True)
    notes = fields.Text(string='Internal Notes')

    _sql_constraints = [
        ('subdomain_unique', 'unique(subdomain)', 'Subdomain must be unique'),
        ('db_name_unique', 'unique(db_name)', 'Database name must be unique'),
    ]

    def name_get(self):
        return [(t.id, f"{t.name} ({t.subdomain}.thestartupos.com)") for t in self]

    def action_provision(self):
        """Mark a tenant as provisioned.

        Real DB provisioning will live in startupos_platform_provisioning; this
        stub keeps the platform core installable and gives admins a safe action.
        """
        for tenant in self:
            tenant.write({
                'provisioned_at': fields.Datetime.now(),
                'state': 'active',
            })
            tenant.message_post(body=_("Tenant marked as provisioned."))
        return True

    def action_suspend(self):
        for tenant in self:
            tenant.write({'state': 'suspended'})
            tenant.message_post(body=_("Tenant suspended."))
        return True

    def action_reactivate(self):
        for tenant in self:
            tenant.write({'state': 'active'})
            tenant.message_post(body=_("Tenant reactivated."))
        return True

    @api.model
    def create_from_signup(self, vals):
        """Hook called by the signup flow. Creates the DB, installs modules, returns the tenant."""
        tenant = self.create(vals)
        tenant.message_post(body=_("Tenant created. Provisioning started."))
        # The actual provisioning (DB creation, module install) is triggered by
        # `startupos_platform_provisioning` which listens to this create.
        return tenant
