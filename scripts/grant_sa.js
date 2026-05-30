const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.userRole.upsert({
  where: { userId_roleId: { userId: 'cmpm2i8ox002d8np4wy0d49qy', roleId: 'cmpm2i8gb000z8np44kwipydk' } },
  create: { id: 'sa_admin_001', userId: 'cmpm2i8ox002d8np4wy0d49qy', roleId: 'cmpm2i8gb000z8np44kwipydk' },
  update: {},
}).then(() => { console.log('DONE: SUPER_ADMIN granted'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
