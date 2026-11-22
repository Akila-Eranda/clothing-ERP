#!/bin/sh
# Verifies, INSIDE the running API container, that WhatsApp credentials live in a private folder that this
# process can write, that nobody else can read, and that is not part of the public uploads tree.
#   docker compose -p hexalyte-staging --env-file .env.staging -f docker-compose.staging.yml exec -T api-a sh -s < ops/staging/verify-private-storage.sh
# Prints PASS/FAIL per check; exit code 1 if any FAIL. Writes (and removes) one probe file. Never prints file contents.
fail=0
chk() { if [ "$1" = "0" ]; then echo "PASS  $2"; else echo "FAIL  $2"; fail=1; fi; }

AUTH="${WHATSAPP_AUTH_DIR:-/app/private/whatsapp-sessions}"
UPL="${LOCAL_UPLOAD_DIR:-/app/uploads}"
echo "auth dir : $AUTH"
echo "uploads  : $UPL"
echo "user     : $(id -u):$(id -g)"

[ "$(id -u)" = "1001" ]; chk $? "API runs as uid 1001 (non-root)"
case "$AUTH" in "$UPL"|"$UPL"/*) r=1;; *) r=0;; esac; chk $r "auth dir is NOT inside the public uploads folder"
mkdir -p "$AUTH" 2>/dev/null; chk $? "auth dir exists / can be created by uid 1001"
ROOT="$(dirname "$AUTH")"
[ "$(stat -c %u "$ROOT" 2>/dev/null)" = "1001" ]; chk $? "private root $ROOT is owned by uid 1001"
mode="$(stat -c %a "$ROOT" 2>/dev/null)"; [ "$mode" = "700" ] || [ "$mode" = "750" ]; chk $? "private root mode is 700/750 (is $mode)"
probe="$AUTH/.probe-$$"; ( umask 077; echo x > "$probe" ) 2>/dev/null; chk $? "can write a file in the auth dir"
[ -f "$probe" ] && [ "$(stat -c %a "$probe")" = "600" ]; chk $? "new files are private (mode 600)"
rm -f "$probe" 2>/dev/null; [ ! -e "$probe" ]; chk $? "probe file removed"
# the public tree must not contain whatsapp-sessions or .ssl-pending reachable via /uploads/
[ ! -e "$UPL/whatsapp-sessions" ]; chk $? "no whatsapp-sessions folder under uploads"
# fallback guard: the code falls back to /tmp when the private dir is not writable - that would lose sessions on restart
[ ! -d /tmp/whatsapp-sessions ]; chk $? "no /tmp/whatsapp-sessions fallback in use"
exit $fail
