# -*- coding: utf-8 -*-
{
    'name': 'The Startup OS Website Theme',
    'version': '19.0.1.0.0',
    'category': 'Theme/Corporate',
    'summary': 'Marketing homepage for the apex The Startup OS tenant',
    'description': '''
The Startup OS Website Theme

Makes the Odoo website homepage serve the public marketing page for the apex
tenant at thestartupos.com.
    ''',
    'author': 'The Startup OS',
    'website': 'https://thestartupos.com',
    'depends': ['website'],
    'data': [
        'views/homepage.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'startupos_theme/static/src/scss/homepage.scss',
        ],
    },
    'demo': [],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
