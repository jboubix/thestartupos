# -*- coding: utf-8 -*-
{
    'name': 'Startupos Fundraising',
    'version': '19.0.1.0.0',
    'category': 'Tools',
    'summary': 'Investor CRM and data room (Phase 3)',
    'description': '''
Investor CRM and data room (Phase 3)

This module is part of The Startup OS — a multitenant SaaS that runs a non-technical
founder's entire startup on a curated, AI-augmented Odoo 19 stack.

See https://thestartupos.com for the platform overview.
    ''',
    'author': 'The Startup OS',
    'website': 'https://thestartupos.com',
    'depends': ['base', 'mail', 'crm'],
    'data': [
        'security/ir.model.access.csv',
    ],
    'demo': [],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
