KC_SERVICE = """
  erp_keycloak:
    image: quay.io/keycloak/keycloak:24.0
    container_name: fashionerp_keycloak
    restart: unless-stopped
    command: start-dev
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: FashionKC@2025!
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://erp_postgres:5432/fashionerp_kc
      KC_DB_USERNAME: fashionerp
      KC_DB_PASSWORD: FashionErp@2025!
      KC_HOSTNAME_STRICT: "false"
      KC_HTTP_ENABLED: "true"
      KC_PROXY: edge
    depends_on:
      erp_postgres:
        condition: service_healthy
    networks:
      - erp-network

"""

content = open('/opt/fashionerp/docker-compose.prod.yml').read()

# Insert before erp_api
if 'erp_keycloak:' in content:
    print('Keycloak already in docker-compose')
else:
    content = content.replace('  erp_api:', KC_SERVICE + '  erp_api:', 1)
    open('/opt/fashionerp/docker-compose.prod.yml', 'w').write(content)
    print('Keycloak service added OK')

# Also update KEYCLOAK_URL in erp_api to use internal KC
content = open('/opt/fashionerp/docker-compose.prod.yml').read()
content = content.replace(
    'KEYCLOAK_URL: https://auth.hexalyte.com',
    'KEYCLOAK_URL: http://erp_keycloak:8080'
)
content = content.replace(
    'KC_REALM: hexalyte',
    'KC_REALM: fashion-erp'
)
content = content.replace(
    'KC_CLIENT_ID: fashionerp-api',
    'KC_CLIENT_ID: fashion-erp-api'
)
content = content.replace(
    'KC_CLIENT_SECRET: H6Hd4egzZsyZa3tWkFYJgONDmbADC8gq',
    'KC_CLIENT_SECRET: changeme-will-be-set-after-bootstrap'
)
open('/opt/fashionerp/docker-compose.prod.yml', 'w').write(content)
print('API KC env vars updated to use internal Keycloak')
