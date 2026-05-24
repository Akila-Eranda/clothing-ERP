content = open('/opt/fashionerp/docker-compose.prod.yml').read()
content = content.replace(
    'KC_CLIENT_SECRET: 0vIwiyGSlCs6LDmZANMdoxHWAbYUmpis',
    'KC_CLIENT_SECRET: H6Hd4egzZsyZa3tWkFYJgONDmbADC8gq'
)
open('/opt/fashionerp/docker-compose.prod.yml', 'w').write(content)
print('Secret updated OK')
