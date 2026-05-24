content = open('/opt/fashionerp/docker-compose.prod.yml').read()

old = '''  erp_web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile'''

new = '''  erp_web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: https://shop.clothing.api.hexalyte.com/api/v1'''

if 'NEXT_PUBLIC_API_URL: https://shop.clothing' in content:
    print('Build arg already present')
else:
    content = content.replace(old, new, 1)
    open('/opt/fashionerp/docker-compose.prod.yml', 'w').write(content)
    print('Build arg added OK')
