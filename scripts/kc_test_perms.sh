#!/bin/bash
TOKEN=$(curl -s -X POST https://auth.hexalyte.com/realms/fashion-erp/protocol/openid-connect/token \
  -d 'grant_type=client_credentials&client_id=fashion-erp-api&client_secret=TVvBWcH9p8CpU7M0WLfQR7xnz3qGXnlM' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
echo "Token: ${TOKEN:0:20}..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "https://auth.hexalyte.com/admin/realms/fashion-erp/users?max=1" \
  -H "Authorization: Bearer $TOKEN")
echo "Users API status: $STATUS"
