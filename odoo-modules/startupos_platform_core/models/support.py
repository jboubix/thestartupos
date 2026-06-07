# -*- coding: utf-8 -*-
from odoo import api, fields, models


class StartupSupportTicket(models.Model):
    """Support requests tied to a tenant. Tracked separately from the tenant DB."""
    _name = 'startupos.support.ticket'
    _description = 'StartupOS Support Ticket'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'create_date desc'

    name = fields.Char(required=True)
    tenant_id = fields.Many2one('startupos.tenant', string='Tenant', required=True)
    state = fields.Selection([
        ('open', 'Open'),
        ('in_progress', 'In Progress'),
        ('waiting', 'Waiting on Customer'),
        ('resolved', 'Resolved'),
        ('closed', 'Closed'),
    ], default='open', tracking=True)
    priority = fields.Selection([
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ], default='normal')
    description = fields.Html()
