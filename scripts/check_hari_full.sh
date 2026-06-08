#!/bin/bash
# Check DB for user password
docker exec fashionerp_db psql -U fashionerp -d fashionerp -c "
SELECT u.email, u.status, u.\"passwordHash\" IS NOT NULL as has_password
FROM users u
JOIN tenants t ON t.id = u.\"tenantId\"
WHERE t.subdomain = 'hari-cloth-shop';
"

# Check Keycloak for user
echo "=== Keycloak Users ==="
TOKEN=$(curl -s -X POST https://auth.hexalyte.com/realms/fashion-erp/protocol/openid-connect/token \
  -d 'grant_type=client_credentials&client_id=fashion-erp-api&client_secret=TVvBWcH9p8CpU7M0WLfQR7xnz3qGXnlM' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])' 2>/dev/null)

curl -s "https://auth.hexalyte.com/admin/realms/fashion-erp/users?search=hari" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); [print(u["username"], u.get("email",""), "enabled="+str(u.get("enabled",False))) for u in d]' 2>/dev/null
