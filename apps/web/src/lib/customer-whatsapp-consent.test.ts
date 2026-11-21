import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCustomerWhatsappConsent } from "./customer-whatsapp-consent.ts";

test("reads current and legacy explicit consent metadata", () => {
  assert.equal(hasCustomerWhatsappConsent({ whatsappConsent: true }), true);
  assert.equal(hasCustomerWhatsappConsent({ whatsapp: { consent: true } }), true);
  assert.equal(hasCustomerWhatsappConsent({}), false);
  assert.equal(hasCustomerWhatsappConsent(null), false);
});

test("an explicit current opt-out takes precedence over stale legacy consent", () => {
  assert.equal(hasCustomerWhatsappConsent({
    whatsappConsent: false,
    whatsapp: { consent: true },
  }), false);
});
