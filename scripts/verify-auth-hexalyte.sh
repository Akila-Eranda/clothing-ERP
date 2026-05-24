#!/bin/bash
KC_URL="https://auth.hexalyte.com"
REALM="fashion-erp"
SECRET="TVvBWcH9p8CpU7M0WLfQR7xnz3qGXnlM"
CLIENT_ID="fashion-erp-api"
API="https://shop.clothing.api.hexalyte.com/api/v1"

echo "==> KC token from auth.hexalyte.com/fashion-erp..."
KC_TOKEN=$(curl -sk -X POST "${KC_URL}/realms/${REALM}/protocol/openid-connect/token" \
  -d "client_id=${CLIENT_ID}&client_secret=${SECRET}&grant_type=client_credentials" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$KC_TOKEN" ]; then echo "ERROR: KC token failed"; exit 1; fi
echo "KC token OK"

echo "==> API login..."
API_TOKEN=$(curl -sk -X POST "${API}/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.fashionerp.com","password":"Admin@123456"}' \
  | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
if [ -z "$API_TOKEN" ]; then echo "ERROR: API login failed"; exit 1; fi
echo "API login OK"

echo "==> Creating test user..."
TS=$(date +%s)
EMAIL="kctest${TS}@demo.fashionerp.com"
UROLE=$(curl -sk "${API}/roles" -H "Authorization: Bearer $API_TOKEN" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
CREATE=$(curl -sk -X POST "${API}/users" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"Test@123456\",\"firstName\":\"KC\",\"lastName\":\"Test\",\"roleIds\":[\"${UROLE}\"]}")
USER_ID=$(echo "$CREATE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "DB user: $USER_ID ($EMAIL)"

echo "==> Waiting 5s for KC sync to auth.hexalyte.com..."
sleep 5

echo "==> Checking auth.hexalyte.com/fashion-erp users..."
RESULT=$(curl -sk "${KC_URL}/admin/realms/${REALM}/users?search=${EMAIL}" \
  -H "Authorization: Bearer $KC_TOKEN" | grep -o '"username":"[^"]*"')
echo "KC user: $RESULT"

echo ""
echo "==> All users in auth.hexalyte.com/fashion-erp..."
curl -sk "${KC_URL}/admin/realms/${REALM}/users?max=20" \
  -H "Authorization: Bearer $KC_TOKEN" | grep -o '"username":"[^"]*"'

echo ""
echo "==> Groups..."
curl -sk "${KC_URL}/admin/realms/${REALM}/groups" \
  -H "Authorization: Bearer $KC_TOKEN" | grep -o '"name":"[^"]*"'
