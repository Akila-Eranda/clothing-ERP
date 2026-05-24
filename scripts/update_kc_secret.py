import sys
secret = sys.argv[1]
content = open('/opt/fashionerp/docker-compose.prod.yml').read()
content = content.replace(
    'KC_CLIENT_SECRET: changeme-will-be-set-after-bootstrap',
    f'KC_CLIENT_SECRET: {secret}'
)
open('/opt/fashionerp/docker-compose.prod.yml', 'w').write(content)
print(f'docker-compose KC_CLIENT_SECRET updated to: {secret}')
