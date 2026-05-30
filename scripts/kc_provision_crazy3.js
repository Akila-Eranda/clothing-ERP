const { PrismaClient } = require('@prisma/client');

const KC_URL = 'https://auth.hexalyte.com';
const KC_REALM = 'hexalyte';
const KC_CLIENT = 'hexalyte-backend';
const KC_SECRET = 'MTn88PrnUswYgydsveQZumTX2lzqkbbg';

async function getToken() {
  const res = await fetch(`${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: KC_CLIENT, client_secret: KC_SECRET }).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token failed ${res.status}: ${JSON.stringify(json)}`);
  return json.access_token;
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
  const user = await prisma.user.findFirst({ where: { email: 'crazydreams.lk@gmail.com' } });
  await prisma.$disconnect();
  if (!tenant || !user) throw new Error('tenant/user not found');

  console.log(`Tenant: ${tenant.name} (${tenant.subdomain})`);
  console.log(`User: ${user.email}`);

  const token = await getToken();
  console.log('KC token OK');

  const groupSearch = await kc(token, `/groups?search=${encodeURIComponent(tenant.subdomain)}&exact=true`);
  if (!groupSearch.ok) throw new Error(`group search failed ${groupSearch.status}: ${await groupSearch.text()}`);
  const groups = await groupSearch.json();

  let groupId = groups[0]?.id;
  if (!groupId) {
    const createGroup = await kc(token, '/groups', {
      method: 'POST',
      body: JSON.stringify({ name: tenant.subdomain, attributes: { tenantName: [tenant.name] } }),
    });
    if (!createGroup.ok) throw new Error(`group create failed ${createGroup.status}: ${await createGroup.text()}`);
    groupId = createGroup.headers.get('Location')?.split('/').pop();
    console.log(`Group created: ${groupId}`);
  } else {
    console.log(`Group exists: ${groupId}`);
  }

  const username = `${tenant.subdomain}__${user.email}`;
  const createUser = await kc(token, '/users', {
    method: 'POST',
    body: JSON.stringify({
      username,
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      enabled: true,
      credentials: [{ type: 'password', value: 'ChangeMe@123!', temporary: true }],
      attributes: {
        db_user_id: [user.id],
        tenant_id: [tenant.id],
        tenant_slug: [tenant.subdomain],
        user_role: ['TENANT_ADMIN'],
      },
    }),
  });

  let kcUserId = createUser.headers.get('Location')?.split('/').pop();
  if (createUser.status === 409) {
    console.log('User exists, fetching by username...');
    let findRes = await kc(token, `/users?username=${encodeURIComponent(username)}&exact=true`);
    let users = await findRes.json();
    if (!users.length) {
      console.log('Not found by username, trying email...');
      findRes = await kc(token, `/users?email=${encodeURIComponent(user.email)}&exact=true`);
      users = await findRes.json();
    }
    kcUserId = users[0]?.id;
    console.log('Found KC user:', kcUserId);
  } else if (!createUser.ok) {
    throw new Error(`user create failed ${createUser.status}: ${await createUser.text()}`);
  } else {
    console.log(`User created: ${kcUserId}`);
  }

  if (!kcUserId) throw new Error('KC user id missing');
  const addGroup = await kc(token, `/users/${kcUserId}/groups/${groupId}`, { method: 'PUT' });
  if (!addGroup.ok && addGroup.status !== 204) throw new Error(`add group failed ${addGroup.status}: ${await addGroup.text()}`);

  console.log('DONE: Crazy Dream Pvt Ltd user added to Keycloak group');
  console.log(`Username: ${username}`);
  console.log('Temporary password: ChangeMe@123!');
}

main().catch((e) => { console.error(e); process.exit(1); });
