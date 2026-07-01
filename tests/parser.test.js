const assert = require("assert");
const fs = require("fs");
const path = require("path");
const parser = require("../src/parser.js");

assert.deepStrictEqual(parser.parseDateHeader("6/15"), {
  date: "2026-06-15",
  sourceDateText: "6/15",
  fileName: "2026-06-15.json"
});

assert.deepStrictEqual(parser.parseDateHeader("6/15-6/18"), {
  date: "2026-06-18",
  sourceDateText: "6/15-6/18",
  fileName: "2026-06-18.json"
});

assert.deepStrictEqual(parser.parseDateHeader("6/15 - 6/18"), {
  date: "2026-06-18",
  sourceDateText: "6/15 - 6/18",
  fileName: "2026-06-18.json"
});

assert.deepStrictEqual(parser.parseDateHeader("6/15～6/18"), {
  date: "2026-06-18",
  sourceDateText: "6/15～6/18",
  fileName: "2026-06-18.json"
});

assert.deepStrictEqual(parser.parseDateHeader("2025/12/21"), {
  date: "2025-12-21",
  sourceDateText: "2025/12/21",
  fileName: "2025-12-21.json"
});

assert.deepStrictEqual(parser.parseDateHeader("2026-06-15"), {
  date: "2026-06-15",
  sourceDateText: "2026-06-15",
  fileName: "2026-06-15.json"
});

const fixture = fs.readFileSync(path.join(__dirname, "..", "fixtures", "old-doc-sample.txt"), "utf8");
const result = parser.parsePlainTextFixture(fixture);

assert.strictEqual(result.entries.length, 3);
assert.strictEqual(result.unresolved.length, 1);
assert.strictEqual(result.entries[0].date, "2025-12-21");
assert.strictEqual(result.entries[1].date, "2026-06-18");
assert.strictEqual(result.entries[1].sourceDateText, "6/15-6/18");
assert.strictEqual(result.entries[2].date, "2026-06-19");

console.log("parser tests passed");
