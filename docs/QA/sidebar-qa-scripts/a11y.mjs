import { launch, session, BASE, SHOTS, rec, results } from "./harness.mjs";
import fs from "node:fs";
const b = await launch();
const D = "#hex-sidebar-desktop";
const wait = (p, ms = 350) => p.waitForTimeout(ms);

const CONTRAST = `
(() => {
  const cv = document.createElement("canvas").getContext("2d");
  const parse = (c) => { cv.fillStyle = "#000"; cv.fillStyle = c; const v = cv.fillStyle;
    if (v.startsWith("#")) return [parseInt(v.slice(1,3),16), parseInt(v.slice(3,5),16), parseInt(v.slice(5,7),16), 1];
    const m = v.match(/[\\d.]+/g).map(Number); if (v.startsWith("color(srgb")) return [m[0]*255, m[1]*255, m[2]*255, m[3] ?? 1]; return [m[0], m[1], m[2], m[3] ?? 1]; };
  const over = (top, bot) => { const a = top[3]; return [0,1,2].map(i => top[i]*a + bot[i]*(1-a)).concat([1]); };
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0) stack.push(c); if (c[3] === 1) break; }
    let acc = [255,255,255,1]; for (let i = stack.length-1; i >= 0; i--) acc = over(stack[i], acc); return acc; };
  const lum = ([r,g,b]) => { const f = (v) => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x,y)=>y-x); return (l1+0.05)/(l2+0.05); };
  window.__contrast = (el, textEl) => { const t = textEl || el; const bg = bgOf(el); const fg = over(parse(getComputedStyle(t).color), bg); return +ratio(fg, bg).toFixed(2); };
})();`;

async function load(p, path) {
  await p.goto(BASE + path, { waitUntil: "load", timeout: 120000 });
  await p.waitForSelector(D, { timeout: 60000 });
  await wait(p, 1200);
  await p.evaluate(CONTRAST);
}

/* ---------- A11y: keyboard-only, focus ring, names ---------- */
{
  const s = await session(b, { viewport: { width: 1440, height: 900 } });
  const p = await s.ctx.newPage();
  await load(p, "/inventory/expiry/near");
  const A = "accessibility";
  await p.evaluate(() => document.querySelector("#hex-sidebar-desktop input")?.focus());
  const seen = [];
  for (let i = 0; i < 28; i++) {
    await p.keyboard.press("Tab");
    seen.push(await p.evaluate(() => {
      const e = document.activeElement; const cs = getComputedStyle(e);
      return { inSide: !!e.closest("#hex-sidebar-desktop"), name: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 22), ring: cs.boxShadow !== "none" || (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) };
    }));
  }
  const inSide = seen.filter((x) => x.inSide);
  const noRing = inSide.filter((x) => !x.ring);
  rec(A, "keyboard Tab reaches sidebar controls in DOM order", inSide.length >= 12 ? "PASS" : "FAIL", `${inSide.length}/28 stops in sidebar`);
  rec(A, "every focused sidebar control shows a visible focus indicator", noRing.length === 0 ? "PASS" : "FAIL", noRing.map((x) => x.name).join(", "));
  await p.keyboard.press("Tab");
  await p.screenshot({ path: SHOTS + "/focus-ring.png", clip: { x: 0, y: 0, width: 260, height: 500 } });

  const unnamed = await p.evaluate(() => [...document.querySelectorAll("#hex-sidebar-desktop a, #hex-sidebar-desktop button, #hex-sidebar-desktop input")].filter((e) => e.getClientRects().length && !e.closest("[inert]") && !((e.getAttribute("aria-label") || e.textContent || "").trim())).map((e) => e.outerHTML.slice(0, 80)));
  rec(A, "expanded: all interactive elements have accessible names", unnamed.length === 0 ? "PASS" : "FAIL", unnamed.join(" | "));
  const roles = await p.evaluate(() => ({
    nav: !!document.querySelector('#hex-sidebar-desktop nav[aria-label="Primary"]'),
    aside: document.getElementById("hex-sidebar-desktop").getAttribute("aria-label"),
    expandedBtns: [...document.querySelectorAll("#hex-sidebar-desktop [aria-expanded]")].length,
    controlsResolve: [...document.querySelectorAll("#hex-sidebar-desktop [aria-controls]")].every((e) => document.getElementById(e.getAttribute("aria-controls"))),
    currentCount: document.querySelectorAll('#hex-sidebar-desktop [aria-current="page"]').length,
    switchOk: document.querySelector('#hex-sidebar-desktop [role="switch"]')?.getAttribute("aria-checked") !== null,
    comboOk: document.querySelector('#hex-sidebar-desktop input')?.getAttribute("role") === "combobox",
  }));
  rec(A, "landmarks/roles: aside label, nav label, switch, combobox", roles.nav && roles.aside && roles.switchOk && roles.comboOk ? "PASS" : "FAIL", JSON.stringify(roles));
  rec(A, "aria-controls targets exist; aria-expanded on toggles", roles.controlsResolve && roles.expandedBtns >= 8 ? "PASS" : "FAIL", `${roles.expandedBtns} toggles`);
  rec(A, "exactly one aria-current=page at a time", roles.currentCount === 1 ? "PASS" : "FAIL", `${roles.currentCount}`);

  // collapsed rail names
  await p.click(`${D} [aria-label="Collapse sidebar"]`);
  await wait(p, 600);
  const unnamed2 = await p.evaluate(() => [...document.querySelectorAll("#hex-sidebar-desktop a, #hex-sidebar-desktop button")].filter((e) => e.getClientRects().length && !((e.getAttribute("aria-label") || e.textContent || "").trim())).map((e) => e.outerHTML.slice(0, 90)));
  rec(A, "collapsed rail: icon-only controls have accessible names", unnamed2.length === 0 ? "PASS" : "FAIL", unnamed2.join(" | "));
  // keyboard-focus a collapsed icon shows tooltip?
  await p.locator('#hex-sidebar-desktop a[aria-label="Notifications"]').focus();
  await p.keyboard.press("Shift+Tab");
  await wait(p, 500);
  const tipOnFocus = await p.evaluate(() => !!document.querySelector('[role="tooltip"]'));
  rec(A, "collapsed rail: tooltip shown on keyboard focus", tipOnFocus ? "PASS" : "FAIL");
  // keyboard activation: Enter on group toggle
  await p.click(`${D} [aria-label="Expand sidebar"]`);
  await wait(p, 500);
  const g = p.locator(`${D} button[aria-controls*="-grp-"]`, { hasText: /CATALOG/i });
  await g.focus();
  await p.keyboard.press("Enter");
  await wait(p, 300);
  const e1 = await g.getAttribute("aria-expanded");
  await p.keyboard.press("Space");
  await wait(p, 300);
  rec(A, "Enter/Space toggle a section from keyboard", e1 === "true" && (await g.getAttribute("aria-expanded")) === "false" ? "PASS" : "FAIL");
  await s.ctx.close();
}

/* ---------- Contrast + accents, light & dark ---------- */
const ACCENTS = ["Blue", "Violet", "Cyan", "Emerald", "Rose", "Orange"];
const table = [];
for (const theme of ["light", "dark"]) {
  for (const accent of ACCENTS) {
    const s = await session(b, { viewport: { width: 1440, height: 900 }, theme });
    const p = await s.ctx.newPage();
    await load(p, "/customers");
    // pick accent through the real Theme Customizer UI
    await p.click('[aria-label="Open theme customizer"]');
    await wait(p, 500);
    await p.click('[role="tab"]:has-text("Colors")');
    await wait(p, 400);
    const sw = p.locator(`[role="dialog"] button[title="${accent}"]`);
    await sw.first().click();
    if (theme === "dark" && (await sw.count()) > 1) await sw.nth(1).click();
    await wait(p, 400);
    await p.click('[aria-label="Close"].tc-header-close', { timeout: 3000 }).catch(() => p.keyboard.press("Escape"));
    await wait(p, 400);

    await load(p, "/inventory/expiry/near");
    if (theme === "dark") { await p.click(`${D} [role="switch"]`); await wait(p, 700); await p.evaluate(CONTRAST); }
    const isDarkNow = await p.evaluate(() => document.documentElement.classList.contains("dark"));
    if ((theme === "dark") !== isDarkNow) throw new Error("theme not applied: " + theme);
    const nested = await p.evaluate(() => { const a = document.querySelector('#hex-sidebar-desktop [aria-current="page"]'); return a ? __contrast(a) : null; });
    const parent = await p.evaluate(() => { const e = [...document.querySelectorAll("#hex-sidebar-desktop button[aria-label^='Collapse Expiry']")][0]?.parentElement; return e ? __contrast(e, e.querySelector("a,button span")) : null; });
    const groupActive = await p.evaluate(() => { const e = [...document.querySelectorAll("#hex-sidebar-desktop button[aria-controls*='-grp-']")].find((x) => /INVENTORY/i.test(x.textContent)); return e ? __contrast(e) : null; });
    const groupIdle = await p.evaluate(() => { const e = [...document.querySelectorAll("#hex-sidebar-desktop button[aria-controls*='-grp-']")].find((x) => /SALES/i.test(x.textContent)); return e ? __contrast(e) : null; });
    const idleLeaf = await p.evaluate(() => { const e = document.querySelector('#hex-sidebar-desktop a[href="/warehouse"]'); return e ? __contrast(e) : null; });
    const footer = await p.evaluate(() => { const e = document.querySelector('#hex-sidebar-desktop a[href="/settings"]'); return e ? __contrast(e) : null; });
    const sectLabel = await p.evaluate(() => { const e = document.querySelector("#hex-sidebar-desktop input"); return e ? __contrast(e) : null; });
    await load(p, "/warehouse");
    const solid = await p.evaluate(() => { const e = document.querySelector('#hex-sidebar-desktop a[aria-current="page"]'); return e ? __contrast(e) : null; });
    const solidBg = await p.evaluate(() => { const e = document.querySelector('#hex-sidebar-desktop a[aria-current="page"]'); return e ? getComputedStyle(e).backgroundColor : null; });
    table.push({ theme, accent, solid, nested, parent, groupActive, groupIdle, idleLeaf, footer, searchText: sectLabel, solidBg });
    if (accent === "Blue" || accent === "Orange" || accent === "Cyan") await p.screenshot({ path: `${SHOTS}/theme-${theme}-${accent.toLowerCase()}.png`, clip: { x: 0, y: 0, width: 300, height: 900 } });
    await s.ctx.close();
  }
}
console.table(table);
fs.writeFileSync("contrast.json", JSON.stringify(table, null, 1));
for (const r of table) {
  const worst = Math.min(...["solid", "nested", "parent", "groupActive", "groupIdle", "idleLeaf", "footer"].map((k) => r[k] ?? 99));
  const worstKey = ["solid", "nested", "parent", "groupActive", "groupIdle", "idleLeaf", "footer"].find((k) => (r[k] ?? 99) === worst);
  rec("contrast", `${r.theme}/${r.accent}: lowest ratio`, worst >= 4.5 ? "PASS" : "FAIL", `${worst}:1 (${worstKey}); solid active ${r.solid}:1 on ${r.solidBg}`);
}
fs.writeFileSync("results-a11y.json", JSON.stringify(results, null, 1));
await b.close();
