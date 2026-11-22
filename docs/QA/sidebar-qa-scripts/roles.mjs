import { launch, session, BASE, SHOTS, rec, results } from "./harness.mjs";
import fs from "node:fs";
const b = await launch();
const D = "#hex-sidebar-desktop";
const wait = (p, ms = 350) => p.waitForTimeout(ms);
const out = {};

async function links(role, shop) {
  const s = await session(b, { viewport: { width: 1440, height: 900 }, role, shop });
  const p = await s.ctx.newPage();
  await p.goto(BASE + "/customers", { waitUntil: "load", timeout: 120000 });
  const hasSide = await p.waitForSelector(D, { timeout: 25000 }).then(() => true).catch(() => false);
  await wait(p, 1200);
  let hrefs = [];
  let body = "";
  if (hasSide) hrefs = await p.evaluate((d) => [...new Set([...document.querySelectorAll(d + " a[href]")].map((a) => a.getAttribute("href")))].sort(), D);
  else body = (await p.evaluate(() => document.body.innerText)).slice(0, 120).replace(/\n/g, " ");
  const url = p.url();
  await s.ctx.close();
  return { hasSide, hrefs, url, body };
}

const roles = ["tenant_admin", "branch_manager", "inventory_manager", "accountant", "viewer", "cashier"];
for (const r of roles) out[`${r}/GROCERY`] = await links(r, "GROCERY");
for (const sh of ["CLOTHING", "HARDWARE", "GENERAL"]) out[`tenant_admin/${sh}`] = await links("tenant_admin", sh);

for (const [k, v] of Object.entries(out)) console.log(k.padEnd(28), v.hasSide ? `${v.hrefs.length} links` : `NO SIDEBAR → ${v.url} "${v.body}"`);

const base = out["tenant_admin/GROCERY"].hrefs;
const diff = (a, b2) => a.filter((x) => !b2.includes(x));
for (const r of ["branch_manager", "inventory_manager", "accountant", "viewer"]) {
  const o = out[`${r}/GROCERY`];
  console.log(`${r}: only-in-admin=${JSON.stringify(diff(base, o.hrefs))} only-in-role=${JSON.stringify(diff(o.hrefs, base))}`);
}
const A = "permissions";
const admin = out["tenant_admin/GROCERY"].hrefs;
const viewer = out["viewer/GROCERY"].hrefs;
rec(A, "sidebar hides items by user role/permission (e.g. viewer must not see Users, Branches, Accounting)", ["/users", "/branches", "/accounting"].every((h) => !viewer.includes(h)) ? "PASS" : "FAIL", `viewer sees: ${["/users", "/branches", "/accounting", "/expenses", "/hr"].filter((h) => viewer.includes(h)).join(", ")}`);
rec(A, "Workflows link follows existing rule (hidden for admins, shown to others)", !admin.includes("/workflows") && out["branch_manager/GROCERY"].hrefs.includes("/workflows") ? "PASS" : "FAIL", `admin:${admin.includes("/workflows")} manager:${out["branch_manager/GROCERY"].hrefs.includes("/workflows")}`);
rec(A, "POS-only role (cashier) gets POS landing instead of ERP sidebar", !out["cashier/GROCERY"].hasSide ? "PASS" : "FAIL", out["cashier/GROCERY"].body);
const g = out["tenant_admin/GROCERY"].hrefs, c = out["tenant_admin/CLOTHING"].hrefs, h = out["tenant_admin/HARDWARE"].hrefs;
console.log("GROCERY-only", diff(g, c), "CLOTHING-only", diff(c, g), "HARDWARE-only", diff(h, g));
rec(A, "vertical gating: CLOTHING shows fashion modules, GROCERY does not", ["/collections", "/outfits"].every((x) => c.includes(x) && !g.includes(x)) ? "PASS" : "FAIL", `clothing-only: ${diff(c, g).join(",")}`);
rec(A, "vertical gating: GROCERY shows expiry/batch, differs from CLOTHING", g.includes("/inventory/expiry") ? "PASS" : "FAIL");

/* search does not expose more than the sidebar shows */
{
  const s = await session(b, { viewport: { width: 1440, height: 900 }, role: "viewer", shop: "GROCERY" });
  const p = await s.ctx.newPage();
  await p.goto(BASE + "/customers", { waitUntil: "load", timeout: 120000 });
  await p.waitForSelector(D);
  await wait(p, 1000);
  const inp = p.locator(`${D} input[aria-label="Search menu"]`);
  await inp.fill("collections");
  await wait(p, 250);
  const n1 = await p.locator(`${D} [role="option"]`).count();
  rec(A, "search never lists vertical-gated items that the sidebar hides (GROCERY: 'collections')", n1 === 0 ? "PASS" : "FAIL", `${n1} results`);
  await inp.fill("users");
  await wait(p, 250);
  const names = await p.locator(`${D} [role="option"]`).allTextContents();
  console.log("viewer search 'users' ->", names);
  /* direct route access as viewer */
  for (const path of ["/users", "/accounting", "/branches"]) {
    await p.goto(BASE + path, { waitUntil: "load", timeout: 120000 });
    await wait(p, 1800);
    const info = await p.evaluate(() => ({ url: location.pathname, text: document.querySelector("main")?.innerText.slice(0, 100).replace(/\n/g, " ") }));
    console.log("viewer direct", path, JSON.stringify(info));
    out[`direct:${path}`] = info;
  }
  await p.screenshot({ path: SHOTS + "/viewer-direct-branches.png" });
  await s.ctx.close();
}
fs.writeFileSync("roles.json", JSON.stringify(out, null, 1));
fs.writeFileSync("results-roles.json", JSON.stringify(results, null, 1));
await b.close();
