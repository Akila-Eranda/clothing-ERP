#!/bin/bash
KC_URL="http://localhost:8080"
ADMIN_USER="admin"
ADMIN_PASS="FashionKC@2025!"
REALM="fashion-erp"
CLIENT_ID="fashion-erp-api"

echo "==> Waiting for Keycloak to be ready..."
for i in $(seq 1 30); do
  STATUS=$(curl -sk -o /dev/null -w '%{http_code}' ${KC_URL}/health/ready 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "Keycloak ready!"
    break
  fi
  echo "  Attempt $i: status=$STATUS, waiting..."
  sleep 5
done

if [ "$STATUS" != "200" ]; then
  echo "ERROR: Keycloak not ready after 150s"
  docker logs fashionerp_keycloak --tail 20
  exit 1
fi

echo "==> Getting master admin token..."
TOKEN=$(curl -sk -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli&username=${ADMIN_USER}&password=${ADMIN_PASS}&grant_type=password" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not get admin token"
  exit 1
fi
echo "Admin token OK"

echo "==> Creating realm: ${REALM}..."
curl -sk -X POST "${KC_URL}/admin/realms" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"realm\":\"${REALM}\",\"displayName\":\"Fashion ERP\",\"enabled\":true,\"registrationAllowed\":false}" \
  -w "HTTP %{http_code}\n" -o /dev/null

echo "==> Creating client: ${CLIENT_ID}..."
curl -sk -X POST "${KC_URL}/admin/realms/${REALM}/clients" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"${CLIENT_ID}\",\"enabled\":true,\"protocol\":\"openid-connect\",\"publicClient\":false,\"serviceAccountsEnabled\":true,\"standardFlowEnabled\":false,\"directAccessGrantsEnabled\":false,\"description\":\"FashionERP API Service Account\"}" \
  -w "HTTP %{http_code}\n" -o /dev/null

echo "==> Getting client UUID..."
CLIENT_UUID=$(curl -sk "${KC_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Client UUID: $CLIENT_UUID"

echo "==> Getting client secret..."
SECRET=$(curl -sk -X POST "${KC_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/client-secret" \
  -H "Authorization: Bearer $TOKEN" \
  | grep -o '"value":"[^"]*"' | cut -d'"' -f4)
echo "Secret: $SECRET"

echo "==> Assigning realm-management roles to service account..."
SA_USER=$(curl -sk -H "Authorization: Bearer $TOKEN" \
  "${KC_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/service-account-user" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

REALM_MGMT=$(curl -sk -H "Authorization: Bearer $TOKEN" \
  "${KC_URL}/admin/realms/${REALM}/clients?clientId=realm-management" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

ROLES=$(curl -sk -H "Authorization: Bearer $TOKEN" \
  "${KC_URL}/admin/realms/${REALM}/clients/${REALM_MGMT}/roles" \
  | grep -o '"id":"[^"]*","name":"[^"]*"' \
  | grep -E 'manage-users|view-users|manage-clients|query-groups|query-users' \
  | sed 's/"id":"\([^"]*\)","name":"\([^"]*\)"/{"id":"\1","name":"\2","composite":false,"clientRole":true}/g' \
  | paste -sd ',' -)

curl -sk -X POST \
  "${KC_URL}/admin/realms/${REALM}/users/${SA_USER}/role-mappings/clients/${REALM_MGMT}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "[${ROLES}]" -w "Roles: HTTP %{http_code}\n" -o /dev/null

echo ""
echo "=============================="
echo "KEYCLOAK BOOTSTRAP COMPLETE"
echo "=============================="
echo "KC_URL (internal): http://erp_keycloak:8080"
echo "KC_REALM: ${REALM}"
echo "KC_CLIENT_ID: ${CLIENT_ID}"
echo "KC_CLIENT_SECRET: ${SECRET}"
echo "=============================="

echo ""
echo "==> Updating fashionerp .env and docker-compose..."
sed -i "s|KC_CLIENT_SECRET=.*|KC_CLIENT_SECRET=${SECRET}|" /opt/fashionerp/.env
python3 /tmp/update_kc_secret.py "$SECRET"
echo "Done - restart fashionerp_api to apply"
