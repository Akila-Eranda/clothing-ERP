content = open('/opt/fashionerp/docker-compose.prod.yml').read()

old = '      KEYCLOAK_URL: https://auth.hexalyte.com'
new = '''      ALLOWED_ORIGINS: https://admin3.hexalyte.com,https://shop.hexalyte.com,https://shop.clothing.api.hexalyte.com
      KEYCLOAK_URL: https://auth.hexalyte.com'''

if 'ALLOWED_ORIGINS' in content:
    print('ALLOWED_ORIGINS already set')
else:
    content = content.replace(old, new, 1)
    open('/opt/fashionerp/docker-compose.prod.yml', 'w').write(content)
    print('ALLOWED_ORIGINS added OK')

# Also update .env
env = open('/opt/fashionerp/.env').read()
import re
if 'ALLOWED_ORIGINS' in env:
    env = re.sub(r'ALLOWED_ORIGINS=.*', 'ALLOWED_ORIGINS=https://admin3.hexalyte.com,https://shop.hexalyte.com,https://shop.clothing.api.hexalyte.com', env)
else:
    env += '\nALLOWED_ORIGINS=https://admin3.hexalyte.com,https://shop.hexalyte.com,https://shop.clothing.api.hexalyte.com\n'
open('/opt/fashionerp/.env', 'w').write(env)
print('.env updated')
