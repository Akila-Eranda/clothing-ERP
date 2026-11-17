// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPROVAL_HEADER,
  APPROVAL_NOT_ACCEPTED,
  approvalErrorText,
  isManagerApprovalRequired,
  ManagerApprovalCancelled,
  registerManagerApprovalHost,
  sanitizePinInput,
  withManagerApproval,
  type ApprovalRequest,
  type ManagerApproval,
} from "./cash-approval.ts";

const needsManager = () => Object.assign(new Error("Refunds above LKR 10,000 need a manager"), { status: 403, code: "MANAGER_APPROVAL_REQUIRED" });
const NOW = 1_000_000;
const approval = (token: string, ttl = 300_000): ManagerApproval => ({ token, managerName: "Mgr", expiresAt: NOW + ttl });

test("no approval needed → runs once, no dialog, no header", async () => {
  const asked: ApprovalRequest[] = [];
  const off = registerManagerApprovalHost(async (r) => { asked.push(r); return null; });
  const calls: (Record<string, string> | undefined)[] = [];
  assert.equal(await withManagerApproval("x", async (h) => { calls.push(h); return 7; }), 7);
  assert.deepEqual(calls, [undefined]);
  assert.equal(asked.length, 0);
  off();
});

test("manager required → dialog, then one retry with the approval header only", async () => {
  const asked: ApprovalRequest[] = [];
  const off = registerManagerApprovalHost(async (r) => { asked.push(r); return approval("tok-1"); });
  const calls: (Record<string, string> | undefined)[] = [];
  const out = await withManagerApproval("Approve refund", async (h) => {
    calls.push(h);
    if (!h) throw needsManager();
    return "ok";
  }, () => NOW);
  assert.equal(out, "ok");
  assert.deepEqual(calls, [undefined, { [APPROVAL_HEADER]: "tok-1" }]);
  assert.deepEqual(asked, [{ action: "Approve refund", message: "Refunds above LKR 10,000 need a manager" }]);
  off();
});

test("token refused on retry (expired / invalid) → asks again with a clear message", async () => {
  const asked: ApprovalRequest[] = [];
  const tokens = ["bad", "good"];
  const off = registerManagerApprovalHost(async (r) => { asked.push(r); return approval(tokens.shift()!); });
  const out = await withManagerApproval("a", async (h) => {
    if (h?.[APPROVAL_HEADER] === "good") return 1;
    throw needsManager();
  }, () => NOW);
  assert.equal(out, 1);
  assert.equal(asked.length, 2);
  assert.equal(asked[1].message, APPROVAL_NOT_ACCEPTED);
  off();
});

test("a token about to expire is not used; the manager is asked again", async () => {
  const tokens = [approval("old", 5_000), approval("new")];
  const sent: string[] = [];
  const off = registerManagerApprovalHost(async () => tokens.shift()!);
  await withManagerApproval("a", async (h) => {
    if (!h) throw needsManager();
    sent.push(h[APPROVAL_HEADER]);
    return 1;
  }, () => NOW);
  assert.deepEqual(sent, ["new"]);
  off();
});

test("cancel → ManagerApprovalCancelled, the action is not retried", async () => {
  const off = registerManagerApprovalHost(async () => null);
  let runs = 0;
  await assert.rejects(withManagerApproval("a", async () => { runs++; throw needsManager(); }), ManagerApprovalCancelled);
  assert.equal(runs, 1);
  off();
});

test("other errors pass through untouched; without a mounted dialog the refusal is shown as is", async () => {
  const off = registerManagerApprovalHost(async () => approval("t"));
  const other = Object.assign(new Error("Not enough cash in the drawer"), { status: 400 });
  await assert.rejects(withManagerApproval("a", async () => { throw other; }), (e) => e === other);
  off();
  const refusal = needsManager();
  await assert.rejects(withManagerApproval("a", async () => { throw refusal; }), (e) => e === refusal);
});

test("only 403 + MANAGER_APPROVAL_REQUIRED opens the dialog", () => {
  assert.equal(isManagerApprovalRequired(needsManager()), true);
  assert.equal(isManagerApprovalRequired({ status: 403, code: "PIN_REJECTED" }), false);
  assert.equal(isManagerApprovalRequired({ status: 403 }), false);
  assert.equal(isManagerApprovalRequired(null), false);
});

test("PIN errors: locked, rejected (no account hints), format", () => {
  assert.match(approvalErrorText({ status: 429, code: "PIN_LOCKED", message: "Too many wrong PINs. Manager approval is locked on this terminal for 14 more minute(s)." }), /locked/);
  assert.equal(approvalErrorText({ status: 403, code: "PIN_REJECTED", message: "x" }), "PIN not accepted. Only a manager of this branch can approve.");
  assert.equal(sanitizePinInput("12a3 45"), "1234");
});
