#!/bin/bash
set -e

KC_URL="https://auth.hexalyte.com"
REALM="hexalyte"
CLIENT_ID="hexalyte-backend"
CLIENT_SECRET="MTn88PrnUswYgydsveQZumTX2lzqkbbg"
NEW_CLIENT="fashionerp-api"

echo "==> Getting admin token..."
TOKEN=$(curl -sk -X POST "${KC_URL}/realms/${REALM}/protocol/openid-connect/token" \
  -d "client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not get token"; exit 1
fi
echo "Token OK"

echo "==> Checking if fashionerp-api client exists..."
EXISTS=$(curl -sk -H "Authorization: Bearer $TOKEN" \
  "${KC_URL}/admin/realms/${REALM}/clients?clientId=${NEW_CLIENT}" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$EXISTS" ]; then
  echo "Client already exists: $EXISTS"
  CLIENT_UUID=$EXISTS
else
  echo "==> Creating fashionerp-api client..."
  curl -sk -X POST "${KC_URL}/admin/realms/${REALM}/clients" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "clientId": "fashionerp-api",
      "enabled": true,
      "protocol": "openid-connect",
      "publicClient": false,
      "serviceAccountsEnabled": true,
      "standardFlowEnabled": false,
      "directAccessGrantsEnabled": false,
      "description": "FashionERP API Service Account"
    }' -o /dev/null -w "HTTP %{http_code}\n"

  CLIENT_UUID=$(curl -sk -H "Authorization: Bearer $TOKEN" \
    "${KC_URL}/admin/realms/${REALM}/clients?clientId=${NEW_CLIENT}" \
    | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "Created: $CLIENT_UUID"
fi

echo "==> Getting/regenerating client secret..."
SECRET=$(curl -sk -X POST \
  "${KC_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/client-secret" \
  -H "Authorization: Bearer $TOKEN" \
  | grep -o '"value":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SECRET" ]; then
  SECRET=$(curl -sk \
    "${KC_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/client-secret" \
    -H "Authorization: Bearer $TOKEN" \
    | grep -o '"value":"[^"]*"' | cut -d'"' -f4)
fi
echo "Secret: $SECRET"

echo "==> Assigning manage-users role to service account..."
SA_USER=$(curl -sk -H "Authorization: Bearer $TOKEN" \
  "${KC_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/service-account-user" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

REALM_MGMT_CLIENT=$(curl -sk -H "Authorization: Bearer $TOKEN" \
  "${KC_URL}/admin/realms/${REALM}/clients?clientId=realm-management" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

ROLES=$(curl -sk -H "Authorization: Bearer $TOKEN" \
  "${KC_URL}/admin/realms/${REALM}/clients/${REALM_MGMT_CLIENT}/roles" \
  | grep -o '"id":"[^"]*","name":"[^"]*"' | grep -E '"manage-users"|"view-users"|"manage-clients"|"query-groups"|"query-users"' \
  | sed 's/"id":"\([^"]*\)","name":"\([^"]*\)"/{"id":"\1","name":"\2","composite":false,"clientRole":true,"containerId":"'$REALM_MGMT_CLIENT'"}/g' \
  | paste -sd ',' -)

curl -sk -X POST \
  "${KC_URL}/admin/realms/${REALM}/users/${SA_USER}/role-mappings/clients/${REALM_MGMT_CLIENT}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "[${ROLES}]" -o /dev/null -w "Roles assigned: HTTP %{http_code}\n"

echo ""
echo "===================================="
echo "KEYCLOAK SETUP COMPLETE"
echo "===================================="
echo "KEYCLOAK_URL=${KC_URL}"
echo "KC_REALM=${REALM}"
echo "KC_CLIENT_ID=${NEW_CLIENT}"
echo "KC_CLIENT_SECRET=${SECRET}"
echo "===================================="
