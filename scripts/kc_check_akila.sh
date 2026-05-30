#!/bin/bash
TOKEN=$(curl -s -X POST https://auth.hexalyte.com/realms/fashion-erp/protocol/openid-connect/token \
  -d 'grant_type=client_credentials&client_id=fashion-erp-api&client_secret=TVvBWcH9p8CpU7M0WLfQR7xnz3qGXnlM' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

echo "=== Groups ==="
curl -s "https://auth.hexalyte.com/admin/realms/fashion-erp/groups?search=akila" \
  -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json; [print(g["id"], g["name"]) for g in json.load(sys.stdin)]'

echo "=== Users ==="
curl -s "https://auth.hexalyte.com/admin/realms/fashion-erp/users?search=akila" \
  -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json; [print(u["id"], u["username"], u.get("email","")) for u in json.load(sys.stdin)]'
