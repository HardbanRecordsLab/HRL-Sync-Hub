// pickOption chooses the best planner window for the requested length (no network): node test/cutdown.js
const assert = require("assert");
const { pickOption } = require("../src/services/engine");

const opts = [
  { kind: "intro", start: 4, end: 34, duration: 30, score: 0.9, naturalEnd: false },
  { kind: "hook", start: 40, end: 70.2, duration: 30.2, score: 1.05, naturalEnd: true },
  { kind: "hook", start: 0, end: 50, duration: 50, score: 2, naturalEnd: true },     // far too long for a 30 s edit
];
assert.strictEqual(pickOption(opts, 30).kind, "hook");
assert.strictEqual(pickOption(opts, 30).start, 40);
assert.strictEqual(pickOption([opts[2]], 30), null);                                     // nothing near the target -> fall back to the plain trim
assert.strictEqual(pickOption([], 30), null);
assert.strictEqual(pickOption(undefined, 60), null);
// a natural ending breaks a near tie
const tie = [{ kind: "intro", start: 0, end: 30, duration: 30, score: 1.0, naturalEnd: false }, { kind: "hook", start: 10, end: 40, duration: 30, score: 0.98, naturalEnd: true }];
assert.strictEqual(pickOption(tie, 30).kind, "hook");
console.log("cutdown picker OK");
