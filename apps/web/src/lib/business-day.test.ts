import { test } from "node:test";
import assert from "node:assert/strict";
import { businessDay } from "./business-day.ts";

// Local-clock dates (the terminal's timezone), so the test builds them from local components.
const at = (h: number, min = 0, day = 24) => new Date(2026, 10, day, h, min, 0);

test("before 03:00 the business day is still yesterday", () => {
  assert.equal(businessDay(at(0, 5)), "2026-11-23");
  assert.equal(businessDay(at(1, 15)), "2026-11-23");
  assert.equal(businessDay(at(2, 59)), "2026-11-23");
});

test("from 03:00 it is the new day", () => {
  assert.equal(businessDay(at(3, 0)), "2026-11-24");
  assert.equal(businessDay(at(14, 30)), "2026-11-24");
  assert.equal(businessDay(at(23, 59)), "2026-11-24");
});

test("month boundary", () => {
  assert.equal(businessDay(new Date(2026, 11, 1, 1, 0, 0)), "2026-11-30");
});
