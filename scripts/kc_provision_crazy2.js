// Backfill Keycloak for "Crazy Dream Pvt Ltd" using master realm admin
const { PrismaClient } = require('@prisma/client');

const KC_URL   = 'https://auth.hexalyte.com';
const KC_REALM = 'hexalyte';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Admin@123456';

async function getToken() {
  const r = await fetch(`${KC_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: ADMIN_USER, password: ADMIN_PASS }).toString(),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('Token failed: ' + JSON.stringify(d));
  console.log('KC admin token obtained');
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

  console.log('Tenant:', tenant.subdomain, '-', tenant.name);
  console.log('User  :', user.email, user.firstName, user.lastName);

  const token = await getToken();

  // Create or get group
  let groupId;
  const gr = await kc(token, `/groups?search=${encodeURIComponent(tenant.subdomain)}&exact=true`);
  const groups = await gr.json();
  if (groups.length > 0) {
    groupId = groups[0].id;
    console.log('Group already exists:', groupId);
  } else {
    const cr = await kc(token, '/groups', {
      method: 'POST',
      body: JSON.stringify({ name: tenant.subdomain, attributes: { tenantName: [tenant.name] } }),
    });
    if (!cr.ok) throw new Error('Group create failed: ' + await cr.text());
    groupId = cr.headers.get('Location').split('/').pop();
    console.log('Group created:', groupId);
  }

  // Create KC user
  const ucr = await kc(token, '/users', {
    method: 'POST',
    body: JSON.stringify({
      username: `${tenant.subdomain}__${user.email}`,
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      enabled: true,
      credentials: [{ type: 'password', value: 'ChangeMe@123!', temporary: true }],
      attributes: {
        db_user_id:  [user.id],
        tenant_id:   [tenant.id],
        tenant_slug: [tenant.subdomain],
        user_role:   ['TENANT_ADMIN'],
      },
    }),
  });

  let kcUserId;
  if (ucr.status === 409) {
    console.log('KC user already exists, looking up...');
    const sr = await kc(token, `/users?username=${encodeURIComponent(tenant.subdomain + '__' + user.email)}`);
    const ulist = await sr.json();
    kcUserId = ulist[0]?.id;
  } else if (!ucr.ok) {
    throw new Error('User create failed: ' + await ucr.text());
  } else {
    kcUserId = ucr.headers.get('Location').split('/').pop();
    console.log('KC user created:', kcUserId);
  }

  // Add to group
  if (kcUserId && groupId) {
    const ar = await kc(token, `/users/${kcUserId}/groups/${groupId}`, { method: 'PUT' });
    if (ar.ok || ar.status === 204) console.log('User added to group:', groupId);
    else console.warn('Add to group response:', ar.status);
  }

  console.log('DONE — Crazy Dream Pvt Ltd provisioned in Keycloak');
}

main().catch(e => { console.error(e); process.exit(1); });
