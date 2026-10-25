import test from "node:test";
import assert from "node:assert/strict";
import {
  getPageSequence,
  getPaginationState,
} from "../admin/pagination.js";

test("clamps pagination state and calculates the visible offset", () => {
  assert.deepEqual(getPaginationState(267, 30, 99), {
    total: 267,
    pageSize: 30,
    page: 9,
    pageCount: 9,
    offset: 240,
    end: 267,
  });
  assert.equal(getPaginationState(0, 30, 8).page, 1);
  assert.equal(getPaginationState(61, 30, 0).page, 1);
});

test("builds compact page sequences with boundary pages", () => {
  assert.deepEqual(getPageSequence(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(getPageSequence(9, 9), [1, null, 5, 6, 7, 8, 9]);
  assert.deepEqual(getPageSequence(5, 9), [1, null, 4, 5, 6, null, 9]);
});
