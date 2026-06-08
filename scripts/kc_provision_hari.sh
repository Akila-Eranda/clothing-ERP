#!/bin/bash
set -e

KC_URL="https://auth.hexalyte.com"
REALM="fashion-erp"
CLIENT_ID="fashion-erp-api"
CLIENT_SECRET="TVvBWcH9p8CpU7M0WLfQR7xnz3qGXnlM"

# Get admin token
echo "Getting admin token..."
TOKEN=$(curl -s -X POST "$KC_URL/realms/$REALM/protocol/openid-connect/token" \
  -d "grant_type=client_credentials&client_id=$CLIENT_ID&client_secret=$CLIENT_SECRET" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Check if group exists
echo "Checking for hari-cloth-shop group..."
GROUP=$(curl -s "$KC_URL/admin/realms/$REALM/groups?search=hari-cloth-shop" \
  -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')

if [ -z "$GROUP" ]; then
  echo "Creating group hari-cloth-shop..."
  curl -s -X POST "$KC_URL/admin/realms/$REALM/groups" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"hari-cloth-shop"}'
  GROUP=$(curl -s "$KC_URL/admin/realms/$REALM/groups?search=hari-cloth-shop" \
    -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')
  echo "Group created: $GROUP"
else
  echo "Group exists: $GROUP"
fi

# Check/create user
echo "Checking for user hari-cloth-shop__Harithaweerasekara128@gmail.com..."
USER=$(curl -s "$KC_URL/admin/realms/$REALM/users?username=hari-cloth-shop__Harithaweerasekara128@gmail.com" \
  -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')

if [ -z "$USER" ]; then
  echo "Creating user..."
  curl -s -X POST "$KC_URL/admin/realms/$REALM/users" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "username":"hari-cloth-shop__Harithaweerasekara128@gmail.com",
      "email":"Harithaweerasekara128@gmail.com",
      "enabled":true,
      "groups":["hari-cloth-shop"],
      "credentials":[{"type":"password","value":"Tenant@123456","temporary":false}]
    }'
  echo "User created with password: Tenant@123456"
else
  echo "User exists: $USER"
fi

echo "Done!"
