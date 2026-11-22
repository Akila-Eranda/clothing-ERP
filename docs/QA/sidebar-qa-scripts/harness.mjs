import { chromium } from "playwright-core";
import fs from "node:fs";

export const BASE = "http://localhost:3100";
export const SHOTS = "e:/main ERP hexalyte/docs/QA/screenshots";
fs.mkdirSync(SHOTS, { recursive: true });

const EXE = process.env.USERPROFILE.replace(/\\/g, "/") + "/AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe";

export async function launch() {
  return chromium.launch({ executablePath: EXE, headless: true });
}

function jwt(payload) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "none" })}.${b(payload)}.sig`;
}

/** New context with a fake logged-in session and a mocked API (no backend / DB touched). */
export async function session(browser, { role = "tenant_admin", shop = "GROCERY", unread = 3, viewport, theme, extra } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme: theme === "dark" ? "dark" : "light" });
  const token = jwt({ tenantId: "t1", roles: [role.toUpperCase()], sub: "u1", exp: 9999999999 });
  await ctx.addCookies([{ name: "fe_access_token", value: token, url: BASE }]);
  const user = { id: "u1", name: "QA User", email: "qa@example.test", role, permissions: [], isActive: true, twoFactorEnabled: false, createdAt: new Date().toISOString() };
  await ctx.addInitScript(
    ({ token, user, shop, theme }) => {
      localStorage.setItem("fe_access_token", token);
      localStorage.setItem("fe_refresh_token", "r");
      localStorage.setItem("fe_tenant_id", "t1");
      localStorage.setItem("fe_shop_type", shop);
      sessionStorage.setItem("fe_tenant_profile", JSON.stringify({ shopType: shop, fetchedAt: Date.now() }));
      localStorage.setItem("fashion-erp-auth", JSON.stringify({ state: { user, accessToken: token, refreshToken: "r", isAuthenticated: true }, version: 0 }));
      if (theme) localStorage.setItem("theme", theme);
    },
    { token, user, shop, theme },
  );
  if (!process.env.NO_FONT_FIX) await ctx.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = ".font-sans-local{--font-sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}"; document.head.appendChild(st); }); });
  const calls = [];
  const state = { unread };
  await ctx.route(/localhost:3999\/api\/v1\//, async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace("/api/v1", "");
    calls.push(`${route.request().method()} ${p}`);
    let data = [];
    if (p === "/tenants/me") data = { shopType: shop, name: "QA Shop" };
    else if (p === "/notifications/unread-count") data = state.unread;
    else if (p.startsWith("/branches")) data = [{ id: "b1", name: "Main", code: "M", isDefault: true }];
    else if (p === "/auth/logout") data = {};
    if (extra) { const r = extra(p, route); if (r !== undefined) data = r; }
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ success: true, data, meta: {} }) });
  });
  await ctx.route(/localhost:3999\/.*/, (r) => r.request().method() === "OPTIONS" ? r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } }) : r.fallback());
  return { ctx, calls, state };
}

export const results = [];
export function rec(area, name, status, note = "") {
  results.push({ area, name, status, note });
  console.log(`[${status}] ${area} :: ${name}${note ? " — " + note : ""}`);
}
