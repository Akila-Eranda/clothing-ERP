content = open('/opt/fashionerp/docker-compose.prod.yml').read()

old = '''  erp_web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    container_name: fashionerp_web'''

new = '''  erp_web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: https://shop.clothing.api.hexalyte.com/api/v1
    container_name: fashionerp_web'''

if 'args:' in content and 'NEXT_PUBLIC_API_URL' in content.split('erp_web:')[1].split('container_name:')[0]:
    print('Build arg already in build section - OK')
else:
    if old in content:
        content = content.replace(old, new, 1)
        open('/opt/fashionerp/docker-compose.prod.yml', 'w').write(content)
        print('Build arg added to build section OK')
    else:
        print('Pattern not found! Current erp_web section:')
        idx = content.find('erp_web:')
        print(content[idx:idx+300])
