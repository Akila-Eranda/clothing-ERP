// Provision ALL tenants into the correct fashion-erp KC realm
const { PrismaClient } = require('@prisma/client');

const KC_URL    = 'https://auth.hexalyte.com';
const KC_REALM  = 'fashion-erp';
const KC_CLIENT = 'fashion-erp-api';
const KC_SECRET = 'TVvBWcH9p8CpU7M0WLfQR7xnz3qGXnlM';

async function getToken() {
  const r = await fetch(`${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: KC_CLIENT, client_secret: KC_SECRET }).toString(),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Token failed ${r.status}: ${JSON.stringify(d)}`);
  return d.access_token;
}

async function kc(token, path, init = {}) {
  return fetch(`${KC_URL}/admin/realms/${KC_REALM}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

async function provisionTenant(token, tenant, adminUser, adminPassword) {
  console.log(`\n── ${tenant.name} (${tenant.subdomain}) ──`);

  // Create or get group
  let groupId;
  const gr = await kc(token, `/groups?search=${encodeURIComponent(tenant.subdomain)}&exact=true`);
  const groups = await gr.json();
  if (groups.length > 0) {
    groupId = groups[0].id;
    console.log(`  Group exists: ${groupId}`);
  } else {
    const cr = await kc(token, '/groups', {
      method: 'POST',
      body: JSON.stringify({ name: tenant.subdomain, attributes: { tenantName: [tenant.name] } }),
    });
    if (!cr.ok) { console.error(`  Group create failed: ${cr.status} ${await cr.text()}`); return; }
    groupId = cr.headers.get('Location')?.split('/').pop();
    console.log(`  Group created: ${groupId}`);
  }

  // Create or find KC user
  const username = `${tenant.subdomain}__${adminUser.email}`;
  const cr = await kc(token, '/users', {
    method: 'POST',
    body: JSON.stringify({
      username,
      email: adminUser.email,
      firstName: adminUser.firstName || '',
      lastName: adminUser.lastName || '',
      enabled: true,
      credentials: [{ type: 'password', value: adminPassword, temporary: true }],
      attributes: {
        db_user_id:  [adminUser.id],
        tenant_id:   [tenant.id],
        tenant_slug: [tenant.subdomain],
        user_role:   ['TENANT_ADMIN'],
      },
    }),
  });

  let kcUserId;
  if (cr.status === 409) {
    console.log(`  User exists, looking up...`);
    const sr = await kc(token, `/users?username=${encodeURIComponent(username)}&exact=true`);
    const users = await sr.json();
    if (!users.length) {
      const sr2 = await kc(token, `/users?email=${encodeURIComponent(adminUser.email)}&exact=true`);
      const users2 = await sr2.json();
      kcUserId = users2[0]?.id;
    } else {
      kcUserId = users[0]?.id;
    }
  } else if (!cr.ok) {
    console.error(`  User create failed: ${cr.status} ${await cr.text()}`); return;
  } else {
    kcUserId = cr.headers.get('Location')?.split('/').pop();
    console.log(`  User created: ${kcUserId}`);
  }

  if (!kcUserId) { console.error('  KC user id missing'); return; }
  console.log(`  KC user: ${kcUserId}`);

  // Add to group
  const ar = await kc(token, `/users/${kcUserId}/groups/${groupId}`, { method: 'PUT' });
  if (ar.ok || ar.status === 204) {
    console.log(`  Added to group ✓`);
  } else {
    console.warn(`  Add group: ${ar.status} ${await ar.text()}`);
  }
}

async function main() {
  const prisma = new PrismaClient();
  const tenants = await prisma.tenant.findMany({ include: { users: { take: 1, orderBy: { createdAt: 'asc' } } } });
  await prisma.$disconnect();

  const token = await getToken();
  console.log('KC token OK (fashion-erp realm)');

  // Test admin API access
  const testRes = await kc(token, '/users?max=1');
  if (!testRes.ok) {
    const errText = await testRes.text();
    console.error(`Admin API access FAILED (${testRes.status}): ${errText}`);
    console.error('\nNeed to enable service accounts + assign manage-users role for fashion-erp-api client in KC admin console.');
    process.exit(1);
  }
  console.log('Admin API access OK');

  for (const tenant of tenants) {
    const adminUser = tenant.users[0];
    if (!adminUser) { console.log(`No users for ${tenant.name}, skipping`); continue; }
    await provisionTenant(token, tenant, adminUser, 'ChangeMe@123!');
  }

  console.log('\nDONE');
}

main().catch(e => { console.error(e); process.exit(1); });
