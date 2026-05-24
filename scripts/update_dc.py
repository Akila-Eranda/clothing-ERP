f = open('/opt/fashionerp/docker-compose.prod.yml', 'r')
content = f.read()
f.close()

old = '      FRONTEND_URL: https://shop.hexalyte.com'
new = '''      FRONTEND_URL: https://shop.hexalyte.com
      KEYCLOAK_URL: https://auth.hexalyte.com
      KC_REALM: hexalyte
      KC_CLIENT_ID: fashionerp-api
      KC_CLIENT_SECRET: 0vIwiyGSlCs6LDmZANMdoxHWAbYUmpis
      KEYCLOAK_AUTH_ENABLED: "false"'''

if old in content:
    content = content.replace(old, new, 1)
    f = open('/opt/fashionerp/docker-compose.prod.yml', 'w')
    f.write(content)
    f.close()
    print('docker-compose.prod.yml updated OK')
else:
    print('Pattern not found - already updated or different format')
    print('Looking for:', repr(old))
