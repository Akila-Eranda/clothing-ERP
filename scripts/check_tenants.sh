#!/bin/bash
docker exec fashionerp_db psql -U fashionerp -d fashionerp -c 'SELECT id, name, subdomain, status FROM "Tenant" ORDER BY "createdAt" DESC;'
