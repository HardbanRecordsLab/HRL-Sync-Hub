// Public catalogue view for supervisors: slim records built from the CMLP analysis (moods, energy, vocals,
// use cases, keywords, instrumentation) and a tag-based "more like this".
const { queryAll } = require("../db/pool");

const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, rows: [] };

const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x).toLowerCase().trim()).filter(Boolean) : []);

function slim(t) {
  const meta = t.metadata && typeof t.metadata === "object" ? t.metadata : {};
  const mood = Array.isArray(t.mood) ? { tags: t.mood } : t.mood && typeof t.mood === "object" ? t.mood : {};
  return {
    id: t.id, title: t.title, artist: t.artist, duration: t.duration, bpm: t.bpm, key: t.key,
    genre: t.genre || null,
    moods: arr(mood.tags),
    energy: mood.energyLevel || null,
    vibe: mood.vibe || null,
    vocals: typeof meta.hasVocals === "boolean" ? meta.hasVocals : null,
    vocal_gender: meta.vocalStyle?.gender || null,
    keywords: arr(meta.keywords),
    use_cases: Array.isArray(meta.useCases) ? meta.useCases.slice(0, 6) : [],
    instruments: arr(meta.instrumentation),
    genres: arr(meta.additionalGenres),
  };
}

async function publicCatalog() {
  if (Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await queryAll(
    `SELECT t.id, t.title, t.artist, t.duration_ms/1000 AS duration, t.bpm, t.musical_key AS key, t.genre, t.mood, t.metadata
     FROM tracks t WHERE t.is_public = true ORDER BY t.created_at DESC, t.id DESC`
  );
  cache = { at: Date.now(), rows: rows.map(slim) };
  return cache.rows;
}

// Weighted features: genre words and moods count most, instruments least; rare tags (IDF) beat common ones —
// the catalogue is dominated by neo-soul, so plain overlap ranks everything alike.
const WEIGHTS = { w: 2.0, m: 1.5, g: 1.5, k: 1.0, i: 0.5 };

function rawFeatures(t) {
  const words = (t.genre || "").toLowerCase().split(/[\s/-]+/).filter((w) => w.length > 2);
  const f = new Map();
  const add = (type, xs) => xs.forEach((x) => f.set(`${type}:${x}`, WEIGHTS[type]));
  add("m", t.moods); add("k", t.keywords); add("g", t.genres); add("i", t.instruments); add("w", words);
  return f;
}

function vectors(rows) {
  const df = new Map();
  const raw = rows.map(rawFeatures);
  raw.forEach((f) => f.forEach((_, k) => df.set(k, (df.get(k) || 0) + 1)));
  const n = rows.length;
  return raw.map((f) => {
    const v = new Map();
    let norm = 0;
    f.forEach((w, k) => {
      const x = w * Math.log(1 + n / (1 + (df.get(k) || 0)));
      v.set(k, x);
      norm += x * x;
    });
    return { v, norm: Math.sqrt(norm) || 1 };
  });
}

/** Similarity: TF-IDF cosine over tags + tempo closeness + same energy / vocals. */
function similar(rows, id, limit = 12) {
  const idx = rows.findIndex((r) => String(r.id) === String(id));
  if (idx < 0) return null;
  if (cache.vectorsFor !== rows) {
    cache.vectors = vectors(rows);
    cache.vectorsFor = rows;
  }
  const vs = cache.vectors;
  const base = rows[idx];
  const a = vs[idx];
  return rows
    .map((r, i) => {
      if (i === idx) return null;
      const b = vs[i];
      let dot = 0;
      a.v.forEach((x, k) => { const y = b.v.get(k); if (y) dot += x * y; });
      const cos = dot / (a.norm * b.norm);
      const tempo = base.bpm && r.bpm ? Math.max(0, 1 - Math.abs(base.bpm - r.bpm) / 30) : 0;
      const score = 0.8 * cos + 0.12 * tempo + (base.energy && base.energy === r.energy ? 0.04 : 0) + (base.vocals === r.vocals ? 0.04 : 0);
      return { r, score };
    })
    .filter(Boolean)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(({ r, score }) => ({ ...r, similarity: Math.round(score * 100) }));
}

function invalidate() {
  cache.at = 0;
}

module.exports = { publicCatalog, similar, slim, invalidate };
