#!/bin/bash
set -e
LOGIN=$(curl -sk -X POST https://shop.clothing.api.hexalyte.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-id: demo' \
  -d '{"email":"admin@demo.fashionerp.com","password":"Admin@123456"}')
echo "LOGIN ok: $(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success'))")"

REFRESH=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['refreshToken'])")

REFRESH1=$(curl -sk -X POST https://shop.clothing.api.hexalyte.com/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}")
echo "REFRESH1: $REFRESH1"

REFRESH2=$(curl -sk -X POST https://shop.clothing.api.hexalyte.com/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}")
echo "REFRESH2 same token: $REFRESH2"

NEW=$(echo "$REFRESH1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('refreshToken',''))" 2>/dev/null || true)
if [ -n "$NEW" ]; then
  REFRESH3=$(curl -sk -X POST https://shop.clothing.api.hexalyte.com/api/v1/auth/refresh \
    -H 'Content-Type: application/json' \
    -d "{\"refreshToken\":\"$NEW\"}")
  echo "REFRESH3 new token: $(echo $REFRESH3 | head -c 150)"
fi
