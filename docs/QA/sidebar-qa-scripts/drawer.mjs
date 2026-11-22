import { launch, session, BASE, SHOTS, rec, results } from "./harness.mjs";
import fs from "node:fs";
const b = await launch();
const wait = (p, ms = 350) => p.waitForTimeout(ms);
const M = "#hex-sidebar-mobile";
async function mobile(path = "/customers") {
  const s = await session(b, { viewport: { width: 430, height: 932 } });
  const p = await s.ctx.newPage();
  await p.goto(BASE + path, { waitUntil: "load", timeout: 120000 });
  await p.waitForSelector('[aria-label="Open menu"]', { timeout: 60000 });
  await wait(p, 1200);
  return { ...s, p };
}
const where = (p) =>
  p.evaluate(() => {
    const a = document.activeElement;
    return { tag: a?.tagName, label: a?.getAttribute("aria-label") || a?.textContent?.trim().slice(0, 20), inDrawer: !!a?.closest("#hex-sidebar-mobile"), isBurger: a?.getAttribute("aria-label") === "Open menu" };
  });
const isOpen = (p) => p.evaluate(() => !!document.getElementById("hex-sidebar-mobile"));
const A = "drawer";

/* open / close variants */
{
  const { p, ctx } = await mobile();
  await p.click('[aria-label="Open menu"]');
  await wait(p, 500);
  rec(A, "hamburger opens drawer", (await isOpen(p)) ? "PASS" : "FAIL");
  rec(A, "drawer has role=dialog aria-modal", (await p.evaluate(() => { const d = document.querySelector('[role="dialog"][aria-modal="true"]'); return !!d && !!d.querySelector("#hex-sidebar-mobile"); })) ? "PASS" : "FAIL");
  const f0 = await where(p);
  console.log("focus after open:", JSON.stringify(f0));
  rec(A, "focus moves into the drawer on open", f0.inDrawer ? "PASS" : "FAIL", JSON.stringify(f0));
  // focus trap: tab through 60 times, record whether focus leaves drawer
  let escaped = 0;
  for (let i = 0; i < 60; i++) { await p.keyboard.press("Tab"); if (!(await where(p)).inDrawer) escaped++; }
  rec(A, "Tab stays inside the drawer (focus trap)", escaped === 0 ? "PASS" : "FAIL", `${escaped}/60 Tab presses landed outside the drawer`);
  await p.keyboard.press("Escape");
  await wait(p, 400);
  rec(A, "Escape closes drawer", !(await isOpen(p)) ? "PASS" : "FAIL");
  const f1 = await where(p);
  rec(A, "focus restored to hamburger after close", f1.isBurger ? "PASS" : "FAIL", JSON.stringify(f1));
  // overlay click
  await p.click('[aria-label="Open menu"]');
  await wait(p, 400);
  await p.mouse.click(400, 500);
  await wait(p, 400);
  rec(A, "overlay click closes drawer", !(await isOpen(p)) ? "PASS" : "FAIL");
  // close button
  await p.click('[aria-label="Open menu"]');
  await wait(p, 400);
  await p.click(`${M} [aria-label="Close menu"]`);
  await wait(p, 400);
  rec(A, "close (X) button closes drawer", !(await isOpen(p)) ? "PASS" : "FAIL");
  // navigation closes
  await p.click('[aria-label="Open menu"]');
  await wait(p, 400);
  const sg = p.locator(`${M} button[aria-controls*="-grp-"]`, { hasText: /OVERVIEW/i });
  if ((await sg.getAttribute("aria-expanded")) !== "true") { await sg.click(); await wait(p, 350); }
  await p.click(`${M} a[href="/dashboard"]`);
  await p.waitForURL(/dashboard/, { timeout: 60000 });
  await wait(p, 500);
  rec(A, "navigating closes drawer", !(await isOpen(p)) ? "PASS" : "FAIL");
  rec(A, "body scroll restored after close", (await p.evaluate(() => document.body.style.overflow)) !== "hidden" ? "PASS" : "FAIL");
  await ctx.close();
}

/* scroll lock + independent scroll + search in drawer */
{
  const { p, ctx } = await mobile();
  await p.evaluate(() => { const m = document.querySelector("main"); const f = document.createElement("div"); f.style.height = "3000px"; m?.appendChild(f); });
  await p.click('[aria-label="Open menu"]');
  await wait(p, 400);
  const before = await p.evaluate(() => document.querySelector("main").scrollTop);
  await p.mouse.move(400, 500);
  await p.mouse.wheel(0, 600);
  await wait(p, 300);
  const after = await p.evaluate(() => document.querySelector("main").scrollTop);
  console.log("main scrollTop before/after wheel over overlay:", before, after);
  rec(A, "background (main) does not scroll while drawer open", after === before ? "PASS" : "FAIL", `scrollTop ${before} -> ${after} (body overflow hidden only locks <body>; <main> is its own scroller)`);
  // menu scrolls independently
  await p.locator(`${M} button[aria-controls*="-grp-"]`, { hasText: /CATALOG/i }).click();
  await p.locator(`${M} button[aria-controls*="-grp-"]`, { hasText: /FINANCE/i }).click();
  await wait(p, 350);
  const sc = await p.evaluate(() => { const v = document.querySelector("#hex-sidebar-mobile [data-radix-scroll-area-viewport]"); return v ? { sh: v.scrollHeight, ch: v.clientHeight } : null; });
  rec(A, "menu area scrolls independently of fixed footer", sc && sc.sh > sc.ch ? "PASS" : "NOT TESTED", JSON.stringify(sc));
  await p.screenshot({ path: SHOTS + "/mobile-drawer-expanded.png" });
  // search inside drawer
  await p.locator(`${M} input[aria-label="Search menu"]`).fill("supplier");
  await wait(p, 300);
  await p.screenshot({ path: SHOTS + "/mobile-drawer-search.png" });
  await p.keyboard.press("Enter");
  await p.waitForURL(/suppliers|purchases/, { timeout: 60000 }).catch(() => {});
  await wait(p, 500);
  rec(A, "search result opens route and closes drawer", /supplier/.test(p.url()) && !(await isOpen(p)) ? "PASS" : "FAIL", p.url());
  await ctx.close();
}

/* resize mobile -> desktop while open */
{
  const { p, ctx } = await mobile();
  await p.click('[aria-label="Open menu"]');
  await wait(p, 400);
  await p.setViewportSize({ width: 1280, height: 800 });
  await wait(p, 600);
  const st = await p.evaluate(() => ({ drawer: !!document.getElementById("hex-sidebar-mobile"), overflow: document.body.style.overflow, desktop: Math.round(document.getElementById("hex-sidebar-desktop").getBoundingClientRect().width) }));
  rec(A, "resize mobile->desktop closes drawer, unlocks scroll, shows sidebar", !st.drawer && st.overflow !== "hidden" && st.desktop === 250 ? "PASS" : "FAIL", JSON.stringify(st));
  await p.setViewportSize({ width: 800, height: 900 });
  await wait(p, 500);
  const t = await p.evaluate(() => Math.round(document.getElementById("hex-sidebar-tablet").getBoundingClientRect().width));
  rec(A, "resize desktop->tablet swaps to 68px rail", t === 68 ? "PASS" : "FAIL", `${t}`);
  await p.setViewportSize({ width: 400, height: 800 });
  await wait(p, 500);
  const burger = await p.evaluate(() => document.querySelector('[aria-label="Open menu"]').getBoundingClientRect().width > 0);
  rec(A, "resize tablet->mobile shows hamburger", burger ? "PASS" : "FAIL");
  await ctx.close();
}

fs.writeFileSync("results-drawer.json", JSON.stringify(results, null, 1));
await b.close();
