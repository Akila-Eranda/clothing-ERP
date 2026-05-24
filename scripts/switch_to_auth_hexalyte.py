content = open('/opt/fashionerp/docker-compose.prod.yml').read()

content = content.replace(
    'KEYCLOAK_URL: http://erp_keycloak:8080',
    'KEYCLOAK_URL: https://auth.hexalyte.com'
)
content = content.replace(
    'KC_CLIENT_SECRET: WKPJTgImeGjEvFASXN835A3ufcoPEeea',
    'KC_CLIENT_SECRET: TVvBWcH9p8CpU7M0WLfQR7xnz3qGXnlM'
)
content = content.replace(
    'KC_CLIENT_SECRET: changeme-will-be-set-after-bootstrap',
    'KC_CLIENT_SECRET: TVvBWcH9p8CpU7M0WLfQR7xnz3qGXnlM'
)

open('/opt/fashionerp/docker-compose.prod.yml', 'w').write(content)
print('Updated: KEYCLOAK_URL + KC_CLIENT_SECRET')

# Also update .env
env = open('/opt/fashionerp/.env').read()
import re
env = re.sub(r'KEYCLOAK_URL=.*', 'KEYCLOAK_URL=https://auth.hexalyte.com', env)
env = re.sub(r'KC_CLIENT_SECRET=.*', 'KC_CLIENT_SECRET=TVvBWcH9p8CpU7M0WLfQR7xnz3qGXnlM', env)
open('/opt/fashionerp/.env', 'w').write(env)
print('Updated .env')
