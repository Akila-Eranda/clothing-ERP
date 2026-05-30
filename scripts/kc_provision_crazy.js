// Backfill Keycloak for "Crazy Dream Pvt Ltd" tenant
const { PrismaClient } = require('@prisma/client');

const KC_URL    = process.env.KEYCLOAK_URL    || 'https://auth.hexalyte.com';
const KC_REALM  = process.env.KC_REALM        || 'hexalyte';
const KC_CLIENT = process.env.KC_CLIENT_ID    || 'fashionerp-api';
const KC_SECRET = process.env.KC_CLIENT_SECRET;

async function getToken() {
  const r = await fetch(`${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: KC_CLIENT, client_secret: KC_SECRET }).toString(),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('Token failed: ' + JSON.stringify(d));
  return d.access_token;
}

async function kc(token, path, init = {}) {
  return fetch(`${KC_URL}/admin/realms/${KC_REALM}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

async function main() {
  const prisma = new PrismaClient();
  const tenant = await prisma.tenant.findFirst({ where: { subdomain: 'crazy-dream' } });
  const user   = await prisma.user.findFirst({ where: { email: 'crazydreams.lk@gmail.com' } });
  await prisma.$disconnect();

  console.log('Tenant:', tenant.id, tenant.subdomain, tenant.name);
  console.log('User  :', user.id, user.email, user.firstName, user.lastName);

  const token = await getToken();
  console.log('KC token obtained');

  // Create or get group
  let groupId;
  const gr = await kc(token, `/groups?search=${tenant.subdomain}&exact=true`);
  const groups = await gr.json();
  if (groups.length > 0) {
    groupId = groups[0].id;
    console.log('Group already exists:', groupId);
  } else {
    const cr = await kc(token, '/groups', {
      method: 'POST',
      body: JSON.stringify({ name: tenant.subdomain, attributes: { tenantName: [tenant.name] } }),
    });
    groupId = cr.headers.get('Location').split('/').pop();
    console.log('Group created:', groupId);
  }

  // Create KC user
  const cr = await kc(token, '/users', {
    method: 'POST',
    body: JSON.stringify({
      username: `${tenant.subdomain}__${user.email}`,
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      enabled: true,
      credentials: [{ type: 'password', value: 'ChangeMe123!', temporary: true }],
      attributes: {
        db_user_id:   [user.id],
        tenant_id:    [tenant.id],
        tenant_slug:  [tenant.subdomain],
        user_role:    ['TENANT_ADMIN'],
      },
    }),
  });
  if (!cr.ok && cr.status !== 409) {
    const e = await cr.text();
    throw new Error('Create user failed: ' + e);
  }

  let kcUserId;
  if (cr.status === 409) {
    console.log('KC user already exists, fetching...');
    const sr = await kc(token, `/users?q=db_user_id:${user.id}`);
    const users = await sr.json();
    kcUserId = users[0]?.id;
  } else {
    kcUserId = cr.headers.get('Location').split('/').pop();
  }
  console.log('KC user id:', kcUserId);

  // Add to group
  if (kcUserId && groupId) {
    await kc(token, `/users/${kcUserId}/groups/${groupId}`, { method: 'PUT' });
    console.log('User added to group');
  }

  console.log('DONE');
}

main().catch(e => { console.error(e); process.exit(1); });
