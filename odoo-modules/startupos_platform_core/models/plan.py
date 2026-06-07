# -*- coding: utf-8 -*-
from odoo import api, fields, models


class StartupPlan(models.Model):
    """A pricing tier. Controls which modules are installed and what quotas apply."""
    _name = 'startupos.plan'
    _description = 'StartupOS Plan'

    name = fields.Char(required=True)
    code = fields.Selection([
        ('solo', 'Solo'),
        ('team', 'Team'),
        ('growth', 'Growth'),
        ('scale', 'Scale'),
    ], required=True, index=True)
    price_monthly = fields.Float('Price / month (USD)', required=True)
    max_users = fields.Integer('Max Users', default=1)
    ai_calls_per_month = fields.Integer('AI Calls / month', default=200)
    storage_gb = fields.Integer('Storage (GB)', default=1)
    module_ids = fields.Many2many('ir.module.module', string='Extra Modules',
        help='Modules installed for tenants on this plan (beyond the core set).')
    description = fields.Html('Description')
    active = fields.Boolean(default=True)
