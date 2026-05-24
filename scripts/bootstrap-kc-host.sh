#!/bin/bash
# Runs on the HOST, reaches KC via Docker internal IP
KC_CONTAINER="fashionerp_keycloak"
REALM="fashion-erp"
CLIENT_ID="fashion-erp-api"
ADMIN_PASS="FashionKC@2025!"

# Get KC container internal IP
KC_IP=$(docker inspect fashionerp_keycloak --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' | head -1)
KC_URL="http://${KC_IP}:8080"
echo "KC internal IP: $KC_IP"
echo "KC URL: $KC_URL"

echo "==> Testing KC connection..."
STATUS=$(curl -sk -o /dev/null -w '%{http_code}' ${KC_URL}/realms/master)
if [ "$STATUS" != "200" ]; then
  echo "KC not reachable: $STATUS"
  exit 1
fi
echo "KC reachable OK"

echo "==> Getting admin token..."
TOKEN=$(curl -sk -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli&username=admin&password=${ADMIN_PASS}&grant_type=password" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo "ERROR: Admin token failed"
  exit 1
fi
echo "Admin token OK"

echo "==> Creating realm: ${REALM}..."
curl -sk -X POST "${KC_URL}/admin/realms" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"realm\":\"${REALM}\",\"displayName\":\"Fashion ERP\",\"enabled\":true}" \
  -w "Realm: HTTP %{http_code}\n" -o /dev/null

echo "==> Creating client: ${CLIENT_ID}..."
curl -sk -X POST "${KC_URL}/admin/realms/${REALM}/clients" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"${CLIENT_ID}\",\"enabled\":true,\"protocol\":\"openid-connect\",\"publicClient\":false,\"serviceAccountsEnabled\":true,\"standardFlowEnabled\":false,\"directAccessGrantsEnabled\":false}" \
  -w "Client: HTTP %{http_code}\n" -o /dev/null

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
SA_USER=$(curl -sk "${KC_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/service-account-user" \
  -H "Authorization: Bearer $TOKEN" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

REALM_MGMT=$(curl -sk "${KC_URL}/admin/realms/${REALM}/clients?clientId=realm-management" \
  -H "Authorization: Bearer $TOKEN" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

ROLES=$(curl -sk "${KC_URL}/admin/realms/${REALM}/clients/${REALM_MGMT}/roles" \
  -H "Authorization: Bearer $TOKEN" \
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
echo "BOOTSTRAP COMPLETE"
echo "=============================="
echo "KC_CLIENT_SECRET: $SECRET"
echo "=============================="

# Update docker-compose and .env
sed -i "s|KC_CLIENT_SECRET=.*|KC_CLIENT_SECRET=${SECRET}|" /opt/fashionerp/.env
python3 /tmp/update_kc_secret.py "$SECRET"
echo "Files updated. Restarting API..."
cd /opt/fashionerp && docker compose -f docker-compose.prod.yml up -d erp_api
sleep 8
docker logs fashionerp_api --tail 4
