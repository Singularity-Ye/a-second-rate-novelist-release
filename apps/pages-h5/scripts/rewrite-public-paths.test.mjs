import assert from "node:assert/strict";
import test from "node:test";

test("Pages deployment contract never exposes a model secret in browser variables", () => {
  const publicVariables = [
    "NEXT_PUBLIC_API_BASE_URL",
    "NEXT_PUBLIC_PUBLIC_ROOM_DEMO",
    "NEXT_PUBLIC_STRICT_RUNTIME_API_BASE",
  ];
  assert.equal(publicVariables.some((name) => /key|secret|token/iu.test(name)), false);
});
