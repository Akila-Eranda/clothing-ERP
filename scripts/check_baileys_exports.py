#!/usr/bin/env python3
import sys
from _ssh_config import ssh_connect_kwargs
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)
js = r"""
const b = require('@whiskeysockets/baileys');
const m = b.default && typeof b.default === 'object' ? Object.assign({}, b, b.default) : b;
const keys = Object.keys(m).filter((k) => /fetch|Browser|Version/i.test(k));
console.log('keys', keys.join(','));
console.log('hasWaWeb', typeof m.fetchLatestWaWebVersion);
console.log('hasBaileys', typeof m.fetchLatestBaileysVersion);
console.log('Browsers', m.Browsers ? Object.keys(m.Browsers).join(',') : 'none');
if (m.Browsers && m.Browsers.macOS) {
  console.log('macOSChrome', JSON.stringify(m.Browsers.macOS('Chrome')));
}
(async () => {
  try {
    if (m.fetchLatestWaWebVersion) {
      const v = await m.fetchLatestWaWebVersion();
      console.log('waWebVersion', JSON.stringify(v));
    }
  } catch (e) {
    console.log('waWebErr', e.message);
  }
  try {
    const v = await m.fetchLatestBaileysVersion();
    console.log('baileysVersion', JSON.stringify(v));
  } catch (e) {
    console.log('baileysErr', e.message);
  }
  process.exit(0);
})();
"""
with c.open_sftp() as sftp:
    with sftp.file("/tmp/check_baileys.js", "w") as f:
        f.write(js)
_, o, e = c.exec_command(
    "docker cp /tmp/check_baileys.js fashionerp_api:/app/check_baileys.js && docker exec -w /app fashionerp_api node /app/check_baileys.js",
    timeout=90,
)
print(o.read().decode("utf-8", "replace"))
print(e.read().decode("utf-8", "replace")[-1500:])
c.close()
