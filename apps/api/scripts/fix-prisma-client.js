const fs = require('fs');
const path = require('path');

const pkgDir = path.dirname(require.resolve('@prisma/client/package.json'));
const generated = path.join(process.cwd(), 'node_modules', '.prisma', 'client', 'default.js');
let rel = path.relative(pkgDir, generated).replace(/\\/g, '/');
if (!rel.startsWith('.')) rel = `./${rel}`;

fs.writeFileSync(path.join(pkgDir, 'index.js'), `module.exports = require('${rel}');\n`);

const resolved = require.resolve('@prisma/client');
delete require.cache[resolved];
const client = require('@prisma/client');
if (!client.Gender) {
  console.error('Prisma client enums missing after patch', Object.keys(client));
  process.exit(1);
}
console.log('Prisma client patched OK');
