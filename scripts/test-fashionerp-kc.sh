#!/bin/bash
KC_IP=$(docker inspect fashionerp_keycloak --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' | head -1)
KC_URL="http://${KC_IP}:8080"
REALM="fashion-erp"
CLIENT_ID="fashion-erp-api"
SECRET="WKPJTgImeGjEvFASXN835A3ufcoPEeea"

echo "Using KC at: $KC_URL"

echo "==> Testing fashionerp-api client token..."
KC_TOKEN=$(curl -sk -X POST "${KC_URL}/realms/${REALM}/protocol/openid-connect/token" \
  -d "client_id=${CLIENT_ID}&client_secret=${SECRET}&grant_type=client_credentials" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$KC_TOKEN" ]; then
  echo "ERROR: KC token failed"
  exit 1
fi
echo "KC token OK"

echo "==> Getting API token..."
API_TOKEN=$(curl -sk -X POST https://shop.clothing.api.hexalyte.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.fashionerp.com","password":"Admin@123456"}' \
  | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
if [ -z "$API_TOKEN" ]; then echo "ERROR: API login failed"; exit 1; fi
echo "API login OK"

UROLE=$(curl -sk https://shop.clothing.api.hexalyte.com/api/v1/roles \
  -H "Authorization: Bearer $API_TOKEN" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "==> Creating test user (triggers KC sync)..."
TS=$(date +%s)
USER_EMAIL="kctest${TS}@demo.fashionerp.com"
CREATE=$(curl -sk -X POST https://shop.clothing.api.hexalyte.com/api/v1/users \
  -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${USER_EMAIL}\",\"password\":\"Test@123456\",\"firstName\":\"KC\",\"lastName\":\"Test\",\"roleIds\":[\"$UROLE\"]}")
USER_ID=$(echo "$CREATE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$USER_ID" ]; then echo "ERROR: User creation failed: $CREATE"; exit 1; fi
echo "Created DB user: $USER_ID ($USER_EMAIL)"

echo "==> Waiting 5s for KC sync..."
sleep 5

echo "==> Checking fashion-erp KC realm for user..."
KC_USER=$(curl -sk "${KC_URL}/admin/realms/${REALM}/users?search=${USER_EMAIL}" \
  -H "Authorization: Bearer $KC_TOKEN")
echo "$KC_USER" | grep -o '"username":"[^"]*"'

KC_COUNT=$(echo "$KC_USER" | grep -c '"username"' || true)
echo "KC users found: $KC_COUNT"

echo ""
echo "==> All users in fashion-erp realm..."
curl -sk "${KC_URL}/admin/realms/${REALM}/users?max=20" \
  -H "Authorization: Bearer $KC_TOKEN" | grep -o '"username":"[^"]*"'

echo ""
echo "==> Groups in fashion-erp realm..."
curl -sk "${KC_URL}/admin/realms/${REALM}/groups" \
  -H "Authorization: Bearer $KC_TOKEN" | grep -o '"name":"[^"]*"'
