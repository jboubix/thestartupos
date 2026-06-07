# -*- coding: utf-8 -*-
{
    'name': 'StartupOS Platform Core',
    'version': '19.0.1.0.0',
    'category': 'Tools',
    'summary': 'The platform-operator side of The Startup OS — tenant registry, plans, support actions.',
    'description': """
StartupOS Platform Core
=======================
Installed only on the Platform Odoo instance (admin.thestartupos.com).
Tracks every tenant: their database, plan, status, billing state, support notes.

This module is the *source of truth* for "who is using our product".
""",
    'author': 'The Startup OS',
    'website': 'https://thestartupos.com',
    'depends': [
        'base',
        'mail',
        'crm',  # we use CRM to track tenants-as-customers
        'account',
    ],
    'data': [
        'security/ir.model.access.csv',
        'data/plan_data.xml',
        'views/tenant_views.xml',
        'views/plan_views.xml',
        'views/menu_views.xml',
    ],
    'demo': [],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
