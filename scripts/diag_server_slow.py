#!/usr/bin/env python3
"""Diagnose production server slowness."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from _ssh_config import HOST, USER, PASSWORD
CMD = r"""
set -e
echo '===== API HEALTH TIMING ====='
for i in 1 2 3; do
  curl -sk -o /dev/null -w "health_%{http_code} time=%{time_total}s\n" https://shop.clothing.api.hexalyte.com/api/v1/health
done

echo
echo '===== GROCERY / DEEN PAGE TIMING ====='
curl -sk -o /dev/null -w "grocery_home code=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\n" https://grocery.shop.hexalyte.com/
curl -sk -o /dev/null -w "grocery_prod code=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\n" https://grocery.shop.hexalyte.com/products
curl -sk -o /dev/null -w "deen_home code=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\n" https://sl-deen-supermarket.shop.hexalyte.com/
curl -sk -o /dev/null -w "deen_prod code=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\n" https://sl-deen-supermarket.shop.hexalyte.com/products

echo
echo '===== DB PRODUCT COUNTS ====='
docker exec -i fashionerp_db psql -U fashionerp -d fashionerp <<'SQL'
SELECT t.subdomain, COUNT(p.id) AS products
FROM tenants t
LEFT JOIN products p ON p."tenantId" = t.id
GROUP BY t.subdomain
ORDER BY products DESC
LIMIT 15;
SQL

echo
echo '===== DB SIZE / TOP TABLES ====='
docker exec -i fashionerp_db psql -U fashionerp -d fashionerp <<'SQL'
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
SELECT relname AS table, pg_size_pretty(pg_total_relation_size(c.oid)) AS size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 12;
SQL

echo
echo '===== DISK BIG ====='
du -sh /var/lib/docker/overlay2 /var/lib/docker/buildkit /var/lib/docker/containers /var/lib/docker/volumes /opt/fashionerp 2>/dev/null
du -sh /opt/fashionerp/* 2>/dev/null | sort -hr | head -8

echo
echo '===== REDIS ====='
docker exec fashionerp_redis redis-cli INFO memory | head -18
docker exec fashionerp_redis redis-cli DBSIZE

echo
echo '===== PG ACTIVITY ====='
docker exec -i fashionerp_db psql -U fashionerp -d fashionerp <<'SQL'
SELECT state, count(*) FROM pg_stat_activity GROUP BY 1;
SELECT pid, now()-query_start AS age, state, left(query,100) AS q
FROM pg_stat_activity
WHERE state IS DISTINCT FROM 'idle'
  AND query NOT ILIKE '%pg_stat%'
ORDER BY query_start NULLS LAST
LIMIT 8;
SQL

echo
echo '===== LOAD NOW ====='
uptime
free -h | head -3
df -h / | tail -1
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_, stdout, stderr = c.exec_command(CMD, timeout=180)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-3000:])
c.close()
