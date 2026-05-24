#!/bin/bash
API="https://shop.clothing.api.hexalyte.com/api/v1"

echo "====== STEP 1: Admin Login ======"
LOGIN=$(curl -sk -X POST "${API}/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.fashionerp.com","password":"Admin@123456"}')

TOKEN=$(echo "$LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo "Login failed: $LOGIN"
  exit 1
fi
echo "Login OK"
echo "User: $(echo $LOGIN | grep -o '"firstName":"[^"]*"' | cut -d'"' -f4) $(echo $LOGIN | grep -o '"lastName":"[^"]*"' | cut -d'"' -f4)"
echo "Role: $(echo $LOGIN | grep -o '"roles":\[[^]]*\]')"

echo ""
echo "====== STEP 2: Get Available Roles ======"
ROLES=$(curl -sk "${API}/roles" -H "Authorization: Bearer $TOKEN")
echo "$ROLES" | grep -o '"name":"[^"]*"'
ROLE_ID=$(echo "$ROLES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Using role ID: $ROLE_ID"

echo ""
echo "====== STEP 3: Create New User ======"
TS=$(date +%s)
NEW_EMAIL="staff${TS}@demo.fashionerp.com"
CREATE=$(curl -sk -X POST "${API}/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"email\": \"${NEW_EMAIL}\",
    \"password\": \"Staff@123456\",
    \"firstName\": \"Test\",
    \"lastName\": \"Staff\",
    \"roleIds\": [\"${ROLE_ID}\"]
  }")

NEW_USER_ID=$(echo "$CREATE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$NEW_USER_ID" ]; then
  echo "User creation failed: $CREATE"
  exit 1
fi
echo "User created in DB: $NEW_USER_ID"
echo "Email: $NEW_EMAIL"

echo ""
echo "====== STEP 4: Verify KC sync (wait 5s) ======"
sleep 5

KC_IP=$(docker inspect fashionerp_keycloak --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' | head -1)
KC_TOKEN=$(curl -sk -X POST "http://${KC_IP}:8080/realms/fashion-erp/protocol/openid-connect/token" \
  -d "client_id=fashion-erp-api&client_secret=WKPJTgImeGjEvFASXN835A3ufcoPEeea&grant_type=client_credentials" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

KC_USER=$(curl -sk "http://${KC_IP}:8080/admin/realms/fashion-erp/users?search=${NEW_EMAIL}" \
  -H "Authorization: Bearer $KC_TOKEN" \
  | grep -o '"username":"[^"]*"')

echo "KC user: $KC_USER"

echo ""
echo "====== STEP 5: New user login test ======"
NEW_LOGIN=$(curl -sk -X POST "${API}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${NEW_EMAIL}\",\"password\":\"Staff@123456\"}")
NEW_TOKEN=$(echo "$NEW_LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
if [ -n "$NEW_TOKEN" ]; then
  echo "New user login: OK"
else
  echo "New user login result: $(echo $NEW_LOGIN | grep -o '"message":"[^"]*"')"
fi

echo ""
echo "=============================="
echo "SUMMARY"
echo "=============================="
echo "Admin:    admin@demo.fashionerp.com / Admin@123456"
echo "New User: ${NEW_EMAIL} / Staff@123456"
echo "DB ID:    ${NEW_USER_ID}"
echo "KC sync:  ${KC_USER}"
echo "API:      https://shop.clothing.api.hexalyte.com/api/v1"
echo "Swagger:  https://shop.clothing.api.hexalyte.com/api/docs"
