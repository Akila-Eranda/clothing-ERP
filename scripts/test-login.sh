#!/bin/bash
KC_URL="https://auth.hexalyte.com"
REALM="hexalyte"

echo "==> Testing API login..."
RESP=$(curl -sk -X POST https://shop.clothing.api.hexalyte.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.fashionerp.com","password":"Admin@123456"}')
echo "$RESP" | head -c 300
echo

TOKEN=$(echo "$RESP" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo "ERROR: Login failed"
  exit 1
fi
echo "Login OK - got access token"

echo ""
echo "==> Verifying Keycloak isConfigured by checking KC token..."
KC_TOKEN=$(curl -sk -X POST "${KC_URL}/realms/${REALM}/protocol/openid-connect/token" \
  -d "client_id=fashionerp-api&client_secret=0vIwiyGSlCs6LDmZANMdoxHWAbYUmpis&grant_type=client_credentials" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$KC_TOKEN" ]; then
  echo "ERROR: KC token failed"
else
  echo "KC token OK"
fi

echo ""
echo "==> Creating a test user via API (will trigger KC sync)..."
UROLE=$(curl -sk https://shop.clothing.api.hexalyte.com/api/v1/roles \
  -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Role ID: $UROLE"

TS=$(date +%s)
CREATE=$(curl -sk -X POST https://shop.clothing.api.hexalyte.com/api/v1/users \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"kctest${TS}@demo.fashionerp.com\",\"password\":\"Test@123456\",\"firstName\":\"KC\",\"lastName\":\"Test\",\"roleIds\":[\"$UROLE\"]}")
echo "$CREATE" | head -c 300
echo

USER_ID=$(echo "$CREATE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Created user DB ID: $USER_ID"

echo ""
echo "==> Checking if user exists in Keycloak..."
sleep 3
KC_USER=$(curl -sk "${KC_URL}/admin/realms/${REALM}/users?q=db_user_id:${USER_ID}" \
  -H "Authorization: Bearer $KC_TOKEN")
echo "$KC_USER" | head -c 300
echo

KC_COUNT=$(echo "$KC_USER" | grep -o '"username"' | wc -l)
echo "KC users found with this db_user_id: $KC_COUNT"

echo ""
echo "==> All KC users in hexalyte realm..."
curl -sk "${KC_URL}/admin/realms/${REALM}/users?max=20" \
  -H "Authorization: Bearer $KC_TOKEN" | grep -o '"username":"[^"]*"'

echo ""
echo "==> Checking KC groups..."
KC_GROUPS=$(curl -sk "${KC_URL}/admin/realms/${REALM}/groups?search=demo" \
  -H "Authorization: Bearer $KC_TOKEN")
echo "Groups: $KC_GROUPS" | head -c 200
