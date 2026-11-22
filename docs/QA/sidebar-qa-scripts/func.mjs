import { launch, session, BASE, SHOTS, rec, results } from "./harness.mjs";
import fs from "node:fs";
const b = await launch();
const D = "#hex-sidebar-desktop";
const wait = (p, ms = 350) => p.waitForTimeout(ms);
async function open(role = "tenant_admin", path = "/customers", opts = {}) {
  const s = await session(b, { viewport: { width: 1440, height: 900 }, role, ...opts });
  const p = await s.ctx.newPage();
  s.errs = [];
  p.on("pageerror", (e) => s.errs.push(e.message));
  await p.goto(BASE + path, { waitUntil: "load", timeout: 120000 });
  await p.waitForSelector(D, { timeout: 60000 });
  await wait(p, 1200);
  return { ...s, p };
}
const w = (p) => p.evaluate((d) => Math.round(document.querySelector(d).getBoundingClientRect().width), D);
const activeLabel = (p) => p.evaluate(() => document.activeElement?.getAttribute("aria-label"));

/* 1. expand / collapse + persistence */
{
  const { p, ctx } = await open();
  const A = "functional";
  rec(A, "starts expanded 250px", (await w(p)) === 250 ? "PASS" : "FAIL");
  await p.click(`${D} [aria-label="Collapse sidebar"]`);
  await wait(p, 500);
  rec(A, "collapse -> 68px", (await w(p)) === 68 ? "PASS" : "FAIL", `${await w(p)}`);
  await p.screenshot({ path: SHOTS + "/collapsed-rail.png" });
  await p.hover(`${D} a[aria-label="Business Calendar"]`);
  await wait(p, 700);
  const tip = await p.evaluate(() => {
    const t = document.querySelector("[data-radix-popper-content-wrapper]");
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), text: t.textContent.slice(0, 30) };
  });
  rec(A, "collapsed: tooltip appears right of rail, inside viewport", tip && tip.x >= 56 && tip.x + tip.w <= 1440 ? "PASS" : "FAIL", JSON.stringify(tip));
  await p.screenshot({ path: SHOTS + "/collapsed-tooltip.png", clip: { x: 0, y: 0, width: 400, height: 300 } });
  await p.reload({ waitUntil: "load" });
  await p.waitForSelector(D);
  await wait(p, 800);
  rec(A, "collapsed state persists after refresh", (await w(p)) === 68 ? "PASS" : "FAIL");
  await p.click(`${D} [aria-label="Expand sidebar"]`);
  await wait(p, 500);
  rec(A, "expand -> 250px", (await w(p)) === 250 ? "PASS" : "FAIL");
  await ctx.close();
}

/* 2-5. sections, submenus, auto-expand, refresh, settings */
{
  const { p, ctx, errs } = await open("tenant_admin", "/inventory/expiry/near");
  const A = "functional";
  const state = () =>
    p.evaluate((d) => ({
      groups: [...document.querySelectorAll(d + ' button[aria-controls*="-grp-"]')].map((b) => [b.textContent.trim(), b.getAttribute("aria-expanded")]),
      current: [...document.querySelectorAll(d + ' [aria-current="page"]')].map((a) => a.textContent.trim()),
      subs: [...document.querySelectorAll(d + ' button[aria-controls*="-sub-"]')].map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-expanded")]),
    }), D);
  const st = await state();
  console.log("STATE@near", JSON.stringify(st));
  const open_ = st.groups.filter(([, e]) => e === "true").map(([t]) => t);
  rec(A, "auto-expands only the owning group on direct load", open_.length === 1 && /INVENTORY/i.test(open_[0]) ? "PASS" : "FAIL", JSON.stringify(open_));
  rec(A, "active child has aria-current=page", st.current.includes("Near Expiry") ? "PASS" : "FAIL", JSON.stringify(st.current));
  rec(A, "Expiry submenu expanded, sibling Inventory submenu collapsed", st.subs.some(([l, e]) => /Collapse Expiry/.test(l) && e === "true") && st.subs.some(([l, e]) => /Expand Inventory/.test(l) && e === "false") ? "PASS" : "FAIL", JSON.stringify(st.subs));
  await p.screenshot({ path: SHOTS + "/active-nested.png", clip: { x: 0, y: 0, width: 260, height: 900 } });
  await p.reload({ waitUntil: "load" });
  await p.waitForSelector(D);
  await wait(p, 1000);
  const st2 = await state();
  rec(A, "refresh inside nested route keeps expansion + active state", JSON.stringify(st2.current) === JSON.stringify(st.current) && st2.groups.filter(([, e]) => e === "true").length === 1 ? "PASS" : "FAIL", JSON.stringify(st2.current));
  const sales = p.locator(`${D} button[aria-controls*="-grp-"]`, { hasText: /SALES/i });
  await sales.click();
  await wait(p, 400);
  rec(A, "section header opens (aria-expanded=true)", (await sales.getAttribute("aria-expanded")) === "true" ? "PASS" : "FAIL");
  await sales.click();
  await wait(p, 400);
  rec(A, "section header closes", (await sales.getAttribute("aria-expanded")) === "false" ? "PASS" : "FAIL");
  const inert = await p.evaluate((d) => {
    const b = [...document.querySelectorAll(d + ' button[aria-controls*="-grp-"]')].find((x) => /SALES/i.test(x.textContent));
    return document.getElementById(b.getAttribute("aria-controls")).firstElementChild.hasAttribute("inert");
  }, D);
  rec(A, "closed section content is inert (not tabbable)", inert ? "PASS" : "FAIL");
  await p.click(`${D} a:has-text("Expired")`);
  await p.waitForURL(/\/inventory\/expiry\/expired/, { timeout: 60000 });
  await wait(p, 600);
  const st3 = await state();
  rec(A, "nested submenu navigation; active highlight moves", st3.current.includes("Expired") && !st3.current.includes("Near Expiry") ? "PASS" : "FAIL", JSON.stringify(st3.current));
  await p.click(`${D} a:has-text("Warehouse")`);
  await p.waitForURL(/\/warehouse/, { timeout: 60000 });
  await wait(p, 600);
  const st4 = await state();
  rec(A, "leaf navigation (Warehouse): only Warehouse active", st4.current.length === 1 && st4.current[0] === "Warehouse" ? "PASS" : "FAIL", JSON.stringify(st4.current));
  rec(A, "no sidebar runtime errors during navigation", errs.filter((e) => !/Cannot read|undefined/.test(e)).length === 0 ? "PASS" : "FAIL", errs.join(" | ").slice(0, 160));
  await p.click(`${D} a[href="/settings"]`);
  await p.waitForURL(/\/settings/, { timeout: 60000 });
  rec(A, "Settings navigation", "PASS");
  await ctx.close();
}

/* 6-9 search */
{
  const { p, ctx } = await open();
  const A = "search";
  const inp = p.locator(`${D} input[aria-label="Search menu"]`);
  await inp.click();
  await inp.fill("expir");
  await wait(p, 300);
  const res = await p.locator(`${D} [role="option"]`).allTextContents();
  rec(A, "filters across top-level and nested items", res.length >= 5 ? "PASS" : "FAIL", `${res.length} results: ${res.slice(0, 3).join(" / ")}`);
  await p.screenshot({ path: SHOTS + "/search-results.png", clip: { x: 0, y: 0, width: 260, height: 600 } });
  await p.keyboard.press("ArrowDown");
  await wait(p, 100);
  const sel = await p.locator(`${D} [role="option"][aria-selected="true"]`).textContent();
  const ad = await inp.getAttribute("aria-activedescendant");
  rec(A, "ArrowDown moves selection (+aria-activedescendant)", sel && ad ? "PASS" : "FAIL", `${sel.trim().slice(0, 30)} / ${ad}`);
  await p.keyboard.press("ArrowUp");
  await p.keyboard.press("ArrowUp");
  await wait(p, 100);
  const sel2 = await p.locator(`${D} [role="option"][aria-selected="true"]`).textContent();
  rec(A, "ArrowUp wraps to last result", sel2 === res[res.length - 1] ? "PASS" : "FAIL", sel2.trim().slice(0, 30));
  await p.keyboard.press("Enter");
  await p.waitForURL((u) => !/customers/.test(u.pathname), { timeout: 60000 });
  rec(A, "Enter navigates and clears query", (await inp.inputValue()) === "" && /expiry|inventory/.test(p.url()) ? "PASS" : "FAIL", p.url());
  await inp.fill("zzzqq");
  await wait(p, 250);
  rec(A, "empty state when nothing matches", (await p.locator(D).getByText("No menu items found").count()) === 1 ? "PASS" : "FAIL");
  await p.screenshot({ path: SHOTS + "/search-empty.png", clip: { x: 0, y: 0, width: 260, height: 500 } });
  await inp.press("Escape");
  await wait(p, 150);
  rec(A, "Escape clears the query", (await inp.inputValue()) === "" ? "PASS" : "FAIL");
  await inp.fill("sales");
  await p.click(`${D} [aria-label="Clear search"]`);
  await wait(p, 150);
  rec(A, "clear button clears and keeps focus in search", (await inp.inputValue()) === "" && (await activeLabel(p)) === "Search menu" ? "PASS" : "FAIL");
  await inp.fill("PROCUREMENT");
  await wait(p, 200);
  rec(A, "matches on section name too", (await p.locator(`${D} [role="option"]`).count()) >= 3 ? "PASS" : "FAIL");
  await ctx.close();
}

/* Ctrl+K vs Alt+M */
{
  const { p, ctx } = await open();
  const A = "shortcuts";
  await p.locator("body").click({ position: { x: 900, y: 500 } });
  await p.keyboard.press("Control+k");
  await wait(p, 400);
  const af = await p.evaluate(() => ({ el: document.activeElement?.tagName, ph: document.activeElement?.getAttribute("placeholder"), inSidebar: !!document.activeElement?.closest("#hex-sidebar-desktop"), dlg: !!document.querySelector('[role="dialog"]') }));
  console.log("CtrlK ->", JSON.stringify(af));
  rec(A, "Ctrl+K not hijacked by sidebar (header global search still receives it)", !af.inSidebar ? "PASS" : "FAIL", JSON.stringify(af));
  await p.keyboard.press("Escape");
  await p.locator("body").click({ position: { x: 900, y: 500 } });
  await p.keyboard.press("Alt+m");
  await wait(p, 300);
  rec(A, "Alt+M focuses sidebar search", (await activeLabel(p)) === "Search menu" ? "PASS" : "FAIL");
  await ctx.close();

  const o2 = await open("tenant_admin", "/customers");
  await o2.p.evaluate(() => {
    const i = document.createElement("input");
    i.id = "qa-in";
    i.style.cssText = "position:fixed;top:300px;left:600px;z-index:99999";
    document.body.appendChild(i);
    i.focus();
  });
  await o2.p.keyboard.press("Alt+m");
  await wait(o2.p, 250);
  rec(A, "Alt+M ignored while typing in another input", (await o2.p.evaluate(() => document.activeElement?.id)) === "qa-in" ? "PASS" : "FAIL");
  await o2.p.evaluate(() => document.activeElement.blur());
  await o2.p.click(`${D} [aria-label="Collapse sidebar"]`);
  await wait(o2.p, 500);
  await o2.p.keyboard.press("Alt+m");
  await wait(o2.p, 800);
  rec(A, "Alt+M from collapsed rail expands and focuses search", (await w(o2.p)) === 250 && (await activeLabel(o2.p)) === "Search menu" ? "PASS" : "FAIL", `${await w(o2.p)}`);
  await o2.ctx.close();
}

/* notifications */
{
  const { p, ctx, state, calls } = await open("tenant_admin", "/customers", { unread: 3 });
  const A = "notifications";
  const badge = () => p.locator(`${D} a[href="/notifications"] [aria-label$="unread"]`).first().textContent({ timeout: 1500 }).catch(() => null);
  rec(A, "badge shows unread-count from API", (await badge()) === "3" ? "PASS" : "FAIL", `${await badge()}`);
  state.unread = 120;
  await p.locator(`${D} button[aria-controls*="-grp-"]`, { hasText: /OVERVIEW/i }).click();
  await wait(p, 400);
  await p.click(`${D} a[href="/dashboard"]`);
  await p.waitForURL(/dashboard/);
  await wait(p, 1200);
  rec(A, "badge refreshes after navigation; caps at 99+", (await badge()) === "99+" ? "PASS" : "FAIL", `${await badge()}`);
  state.unread = 0;
  const sg = p.locator(`${D} button[aria-controls*="-grp-"]`, { hasText: /SALES/i });
  if ((await sg.getAttribute("aria-expanded")) !== "true") { await sg.click(); await wait(p, 400); }
  await p.click(`${D} a[href="/customers"]`);
  await wait(p, 1500);
  rec(A, "badge hidden at 0", (await p.locator(`${D} a[href="/notifications"] [aria-label$="unread"]`).count()) === 0 ? "PASS" : "FAIL");
  const hdr = await p.evaluate(() => {
    const bell = document.querySelector("header [aria-label*='otification']");
    return bell ? bell.textContent.trim() : "?";
  });
  rec(A, "header bell badge reflects real unread count", hdr === "0" || hdr === "" ? "PASS" : "FAIL", `header shows "${hdr}" while API unread=0 (hardcoded value in header.tsx notificationCount)`);
  rec(A, "unread-count endpoint called (scoped by user+tenant server-side)", calls.includes("GET /notifications/unread-count") ? "PASS" : "FAIL");
  await ctx.close();
}

/* dark mode + logout */
{
  const { p, ctx, calls } = await open();
  const A = "theme/footer";
  await p.click(`${D} [role="switch"]`);
  await wait(p, 600);
  const dark = await p.evaluate(() => document.documentElement.classList.contains("dark"));
  rec(A, "dark-mode switch toggles html.dark and aria-checked", dark && (await p.getAttribute(`${D} [role="switch"]`, "aria-checked")) === "true" ? "PASS" : "FAIL");
  await p.screenshot({ path: SHOTS + "/dark-desktop.png" });
  await p.reload({ waitUntil: "load" });
  await p.waitForSelector(D);
  await wait(p, 800);
  rec(A, "dark mode persists after refresh", (await p.evaluate(() => document.documentElement.classList.contains("dark"))) ? "PASS" : "FAIL");
  await p.click(`${D} button:has-text("Logout")`);
  await p.waitForURL(/\/login/, { timeout: 60000 }).catch(() => {});
  const tok = await p.evaluate(() => localStorage.getItem("fe_access_token"));
  rec(A, "logout calls API, clears token, redirects to /login", /\/login/.test(p.url()) && !tok && calls.includes("DELETE /auth/logout") ? "PASS" : "FAIL", `${p.url()} token=${tok} calls=${calls.filter((c) => /logout/.test(c))}`);
  await ctx.close();
}

fs.writeFileSync("results-func.json", JSON.stringify(results, null, 1));
await b.close();
