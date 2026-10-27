import test from "node:test";
import assert from "node:assert/strict";
import { replaceChildrenSafe } from "../admin/dom.js";

test("replaceChildrenSafe skips missing containers without throwing", () => {
  assert.doesNotThrow(() => {
    assert.equal(replaceChildrenSafe("测试列表", null), false);
    assert.equal(
      replaceChildrenSafe("测试列表", { replaceChildren: null }),
      false,
    );
  });
});

test("replaceChildrenSafe replaces children when the container exists", () => {
  const calls = [];
  const target = {
    replaceChildren(...children) {
      calls.push(children);
    },
  };

  assert.equal(replaceChildrenSafe("测试列表", target, "第一项", "第二项"), true);
  assert.deepEqual(calls, [["第一项", "第二项"]]);
});
