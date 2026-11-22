import { launch, session, BASE, SHOTS, rec, results } from "./harness.mjs";
import fs from "node:fs";
const VPS = [[1920,1080],[1440,900],[1366,768],[1024,768],[768,1024],[430,932],[375,812],[320,720]];
const b = await launch();
for (const [w,h] of VPS) {
  const { ctx } = await session(b, { viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(BASE + "/customers", { waitUntil: "load", timeout: 120000 });
  await p.waitForTimeout(2000);
  const A = `viewport ${w}x${h}`;
  const m = await p.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); return !!e && e.offsetParent !== null || (e && getComputedStyle(e).position==="fixed"); };
    const ids = ["hex-sidebar-desktop","hex-sidebar-tablet","hex-sidebar-mobile"].filter(i => { const e = document.getElementById(i); return e && e.getBoundingClientRect().width > 0; });
    const side = document.getElementById(ids[0] || "");
    const r = side?.getBoundingClientRect();
    const dupIds = (() => { const c = {}; document.querySelectorAll("[id]").forEach(e => c[e.id] = (c[e.id]||0)+1); return Object.entries(c).filter(([k,v]) => v>1 && /sb|hex-sidebar|_r_|:r/.test(k)).map(([k])=>k); })();
    const logout = side && [...side.querySelectorAll("button")].find(x => /logout/i.test(x.textContent||"") || x.getAttribute("aria-label")==="Logout");
    const lr = logout?.getBoundingClientRect();
    const burger = document.querySelector('[aria-label="Open menu"]');
    return {
      visibleSidebars: ids, sideW: r?.width, sideH: r?.height,
      docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sideOverflowX: side ? side.scrollWidth - side.clientWidth : null,
      logoutBottom: lr?.bottom, logoutVisible: lr ? (lr.bottom <= innerHeight && lr.top >= 0) : null,
      burgerVisible: !!burger && burger.getBoundingClientRect().width > 0,
      dupIds,
      fontFamily: getComputedStyle(document.body).fontFamily.slice(0,80),
    };
  });
  console.log(A, JSON.stringify(m));
  await p.screenshot({ path: `${SHOTS}/vp-${w}x${h}.png` });
  const expect = w >= 1024 ? "hex-sidebar-desktop" : w >= 768 ? "hex-sidebar-tablet" : null;
  if (expect) {
    rec(A, `renders ${expect}`, m.visibleSidebars.includes(expect) ? "PASS" : "FAIL", JSON.stringify(m.visibleSidebars));
    rec(A, "sidebar width", (expect==="hex-sidebar-desktop" ? Math.abs(m.sideW-250)<=1 : Math.abs(m.sideW-68)<=1) ? "PASS":"FAIL", `${m.sideW}px`);
    rec(A, "footer (Logout) inside viewport", m.logoutVisible ? "PASS":"FAIL", `bottom=${m.logoutBottom}`);
  } else {
    rec(A, "no persistent sidebar, hamburger shown", (!m.visibleSidebars.length && m.burgerVisible) ? "PASS":"FAIL", JSON.stringify(m));
  }
  rec(A, "no horizontal page overflow", m.docOverflowX<=0 ? "PASS":"FAIL", `overflowX=${m.docOverflowX}`);
  rec(A, "no duplicate sidebar ids", m.dupIds.length===0 ? "PASS":"FAIL", m.dupIds.join(","));
  rec(A, "no runtime page errors", errs.length===0 ? "PASS":"FAIL", errs[0]||"");
  if (!expect) {
    await p.click('[aria-label="Open menu"]');
    await p.waitForTimeout(500);
    const d = await p.evaluate(() => { const e = document.getElementById("hex-sidebar-mobile"); const r = e?.getBoundingClientRect(); const lo = e && [...e.querySelectorAll("button")].find(x=>/logout/i.test(x.textContent||"")); const lr = lo?.getBoundingClientRect(); return { w: r?.width, right: r?.right, vw: innerWidth, logoutBottom: lr?.bottom, vh: innerHeight, bodyOverflow: document.body.style.overflow, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    console.log(A, "drawer", JSON.stringify(d));
    await p.screenshot({ path: `${SHOTS}/vp-${w}x${h}-drawer.png` });
    rec(A, "drawer opens within viewport", d.right<=d.vw+0.5 && d.w>0 ? "PASS":"FAIL", JSON.stringify(d));
    rec(A, "drawer footer visible", d.logoutBottom<=d.vh ? "PASS":"FAIL", `bottom=${d.logoutBottom}/${d.vh}`);
    rec(A, "drawer locks body scroll", d.bodyOverflow==="hidden" ? "PASS":"FAIL", d.bodyOverflow);
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync("results-viewports.json", JSON.stringify(results, null, 1));
