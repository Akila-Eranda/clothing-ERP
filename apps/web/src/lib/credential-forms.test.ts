// Run: pnpm --filter ./apps/web test:unit
// Credential / PIN forms must submit with POST. A <form> without method="post" submits as GET when the user presses
// Enter or taps the button BEFORE React has hydrated (slow phone, first load): the browser then navigates to
// /login?email=...&password=... and the password lands in the address bar, history and server logs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FILES = [
  "../app/(auth)/login/page.tsx",
  "../app/(auth)/register/page.tsx",
  "../app/(auth)/reset-password/page.tsx",
  "../app/(auth)/forgot-password/page.tsx",
  "../app/admin/login/page.tsx",
  "../components/cash/manager-approval-host.tsx",
];

for (const rel of FILES) {
  test(`${rel}: every <form> uses method="post"`, () => {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    const forms = src.match(/<form\b[^>]*>/g) ?? [];
    assert.ok(forms.length > 0, "no <form> found");
    for (const tag of forms) assert.match(tag, /method="post"/, `form without method="post": ${tag.slice(0, 80)}`);
  });
}
