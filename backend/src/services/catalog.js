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

function tagSet(t) {
  const words = (t.genre || "").toLowerCase().split(/[\s/-]+/).filter((w) => w.length > 2);
  return new Set([...t.moods.map((m) => `m:${m}`), ...t.keywords.map((k) => `k:${k}`), ...t.genres.map((g) => `g:${g}`),
    ...t.instruments.map((i) => `i:${i}`), ...words.map((w) => `w:${w}`)]);
}

/** Similarity: tag overlap (Jaccard) + tempo closeness + same energy / vocals. */
function similar(rows, id, limit = 12) {
  const base = rows.find((r) => String(r.id) === String(id));
  if (!base) return null;
  const a = tagSet(base);
  return rows
    .filter((r) => r.id !== base.id)
    .map((r) => {
      const b = tagSet(r);
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      const jac = inter / (a.size + b.size - inter || 1);
      const tempo = base.bpm && r.bpm ? Math.max(0, 1 - Math.abs(base.bpm - r.bpm) / 40) : 0.3;
      const score = jac * 0.7 + tempo * 0.2 + (base.energy && base.energy === r.energy ? 0.05 : 0) + (base.vocals === r.vocals ? 0.05 : 0);
      return { r, score };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(({ r, score }) => ({ ...r, similarity: Math.round(score * 100) }));
}

function invalidate() {
  cache.at = 0;
}

module.exports = { publicCatalog, similar, slim, invalidate };
