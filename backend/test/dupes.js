// node test/dupes.js - grouping of near-identical sonic vectors
const assert = require("assert");
const { groupDuplicates } = require("../src/services/dupes");
function pack(arr) {
  const f16 = (x) => { const b = new Float32Array([x]); const u = new Uint32Array(b.buffer)[0]; const s = (u >>> 16) & 0x8000; let e = ((u >>> 23) & 0xff) - 127 + 15; const m = (u >>> 13) & 0x3ff; if (e <= 0) return s; if (e >= 31) return s | 0x7c00; return s | (e << 10) | m; };
  const buf = Buffer.alloc(arr.length * 2); arr.forEach((x, i) => buf.writeUInt16LE(f16(x), i * 2)); return buf.toString("base64");
}
const rnd = (seed) => { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; }; };
const base = Array.from({ length: 512 }, rnd(1)), other = Array.from({ length: 512 }, rnd(99)), third = Array.from({ length: 512 }, rnd(7));
const items = [
  { id: 1, title: "techno EMBRACE (Vol. 1)", vector: pack(base) },
  { id: 2, title: "techno EMBRACE (Vol. 3)", vector: pack(base.map((x, i) => x + (i % 5 ? 0.01 : -0.01))) },   // another master
  { id: 3, title: "Something else", vector: pack(other) },
  { id: 4, title: "Third", vector: pack(third) },
  { id: 5, title: "Third (re-export)", vector: pack(third.map((x) => x * 1.001)) },
  { id: 6, title: "No vector", vector: "" },
];
const g = groupDuplicates(items, 0.97);
assert.strictEqual(g.length, 2);
assert.deepStrictEqual(g.map((x) => x.members.map((m) => m.id).sort()).sort((a, b) => a[0] - b[0]), [[1, 2], [4, 5]]);
assert.ok(g.every((x) => x.similarity > 0.97 && x.members.every((m) => !("vector" in m))));
assert.strictEqual(groupDuplicates(items, 0.9999).length, 1);                    // stricter threshold keeps only the exact re-export
console.log("duplicate grouping OK");
