f = open('/opt/fashionerp/docker-compose.prod.yml', 'r')
lines = f.readlines()
f.close()

seen = set()
result = []
for line in lines:
    stripped = line.strip()
    # Only deduplicate env var lines inside services
    if stripped.startswith('KEYCLOAK_URL:') or stripped.startswith('KC_REALM:') or \
       stripped.startswith('KC_CLIENT_ID:') or stripped.startswith('KC_CLIENT_SECRET:') or \
       stripped.startswith('KEYCLOAK_AUTH_ENABLED:'):
        key = stripped.split(':')[0]
        if key in seen:
            continue
        seen.add(key)
    result.append(line)

f = open('/opt/fashionerp/docker-compose.prod.yml', 'w')
f.writelines(result)
f.close()
print('Fixed: removed', len(lines) - len(result), 'duplicate lines')
