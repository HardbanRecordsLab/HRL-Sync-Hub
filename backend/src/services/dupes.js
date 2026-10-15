// Duplicate / version finder: tracks whose sonic vectors are (almost) the same recording - another master, a re-export,
// the same song in two albums. Pure grouping; the route supplies the vectors.
const { unpack, cosine } = require("./semantic");

/** items: [{id, title, vector: b64, ...}] -> groups of >= 2 (connected by cosine >= threshold), strongest first. */
function groupDuplicates(items, threshold = 0.97) {
  const vecs = items.map((it) => ({ it, v: unpack(it.vector) })).filter((x) => x.v.length > 0);
  const parent = vecs.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const pairSim = new Map();
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      const s = cosine(vecs[i].v, vecs[j].v);
      if (s >= threshold) { parent[find(i)] = find(j); pairSim.set(`${i}:${j}`, s); }
    }
  }
  const groups = new Map();
  vecs.forEach((x, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  const out = [];
  groups.forEach((idxs) => {
    if (idxs.length < 2) return;
    let min = 1;
    for (let a = 0; a < idxs.length; a++) for (let b = a + 1; b < idxs.length; b++) {
      const key = idxs[a] < idxs[b] ? `${idxs[a]}:${idxs[b]}` : `${idxs[b]}:${idxs[a]}`;
      const s = pairSim.get(key) ?? cosine(vecs[idxs[a]].v, vecs[idxs[b]].v);
      if (s < min) min = s;
    }
    out.push({ similarity: Math.round(min * 1000) / 1000, members: idxs.map((i) => { const { vector, ...rest } = vecs[i].it; return rest; }) });
  });
  return out.sort((a, b) => b.members.length - a.members.length || b.similarity - a.similarity);
}

module.exports = { groupDuplicates };
