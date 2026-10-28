import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePort } from "../src/config.js";

test("PORT is 3000 only when the value is absent", () => {
  assert.equal(parsePort(undefined), 3000);
});

for (const [raw, expected] of [["0", 0], ["3000", 3000], ["65535", 65535], ["00080", 80]] as const) {
  test(`accept decimal port ${raw}`, () => assert.equal(parsePort(raw), expected));
}

for (const raw of ["", "-1", "65536", "abc", "1.5", " 3000", "3000 ", "+80", "0x50", "1e3", "NaN", "999999999999999999999"]) {
  test(`reject port ${JSON.stringify(raw)} without fallback`, () => {
    assert.throws(() => parsePort(raw), RangeError);
  });
}
