// Search by SOUND: the query is embedded by the Metadata Engine's CLAP model (text -> audio space) and compared with each
// track's stored `metadata.sonicVector`. "dark driving techno for a chase scene" ranks tracks by how they actually sound,
// not by the words in their tags. Vectors arrive with Metadata Engine 3.0 analyses / the catalogue back-fill.
const ME_URL = (process.env.METADATA_ENGINE_URL || "https://metadata.hardbanrecordslab.online").replace(/\/$/, "");
const MIN_VECTORS = 10;
const QUERY_TTL_MS = 10 * 60 * 1000;
const queryCache = new Map(); // normalised query -> { at, vec }

/** IEEE half float (the engine ships float16 to keep a 512-d vector at 1 KB). */
function half(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}

function unpack(b64) {
  const buf = Buffer.from(String(b64), "base64");
  const n = buf.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = half(buf.readUInt16LE(i * 2));
  return out;
}

function cosine(a, b) {
  if (a.length !== b.length) return 0;
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

async function embedQuery(q) {
  const key = q.trim().toLowerCase().slice(0, 300);
  const hit = queryCache.get(key);
  if (hit && Date.now() - hit.at < QUERY_TTL_MS) return hit.vec;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(`${ME_URL}/api/intelligence/embed-text`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries: [key] }), signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`embed-text HTTP ${r.status}`);
    const vec = unpack((await r.json()).vectors[0]);
    queryCache.set(key, { at: Date.now(), vec });
    if (queryCache.size > 300) queryCache.delete(queryCache.keys().next().value);
    return vec;
  } finally {
    clearTimeout(timer);
  }
}

/** vectors: Map(id -> Float32Array). Returns { scores: {id: cosine}, count } or null when there is not enough data. */
async function scoreQuery(q, vectors) {
  if (!vectors || vectors.size < MIN_VECTORS) return null;
  const qv = await embedQuery(q);
  const scores = {};
  vectors.forEach((v, id) => { scores[id] = Math.round(cosine(qv, v) * 1000) / 1000; });
  return { scores, count: vectors.size };
}

module.exports = { scoreQuery, unpack, cosine, half, MIN_VECTORS, _queryCache: queryCache };
