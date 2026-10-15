// Unit checks for the sonic-vector helpers (no network): node test/semantic.js
const assert = require("assert");
const { unpack, cosine, half, scoreQuery, _queryCache } = require("../src/services/semantic");

// float16 decoding against known values
assert.strictEqual(half(0x3c00), 1);            // 1.0
assert.strictEqual(half(0xc000), -2);           // -2.0
assert.strictEqual(half(0x0000), 0);
assert.ok(Math.abs(half(0x3555) - 0.3333) < 1e-3);

// pack like the engine: float16 little endian, base64
function pack(arr) {
  const f16 = (x) => { // round-trip through the engine's format via DataView-free conversion
    const b = new Float32Array([x]); const u = new Uint32Array(b.buffer)[0];
    const sign = (u >>> 16) & 0x8000; let e = ((u >>> 23) & 0xff) - 127 + 15; let m = (u >>> 13) & 0x3ff;
    if (e <= 0) return sign; if (e >= 31) return sign | 0x7c00; return sign | (e << 10) | m;
  };
  const buf = Buffer.alloc(arr.length * 2); arr.forEach((x, i) => buf.writeUInt16LE(f16(x), i * 2)); return buf.toString("base64");
}
const a = Array.from({ length: 512 }, (_, i) => Math.sin(i)), b = a.map((x) => x + 0.05), c = Array.from({ length: 512 }, (_, i) => Math.cos(i * 7));
const ua = unpack(pack(a)), ub = unpack(pack(b)), uc = unpack(pack(c));
assert.strictEqual(ua.length, 512);
assert.ok(cosine(ua, ub) > 0.98 && cosine(ua, uc) < 0.3, "near vs far");

(async () => {
  assert.strictEqual(await scoreQuery("anything", new Map()), null);                    // not enough vectors -> null
  // with a cached query vector and >= 10 track vectors, scores come back keyed by id
  _queryCache.set("dark techno", { at: Date.now(), vec: ua });
  const vectors = new Map(); for (let i = 0; i < 12; i++) vectors.set(String(i), i === 3 ? ub : uc);
  const out = await scoreQuery("dark techno", vectors);
  assert.strictEqual(out.count, 12);
  assert.ok(out.scores["3"] > out.scores["0"], "the similar vector scores higher");
  console.log("semantic helpers OK");
})().catch((e) => { console.error(e); process.exit(1); });
