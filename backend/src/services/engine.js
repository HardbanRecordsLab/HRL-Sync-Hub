// Client for the Metadata Engine's smart cutdown planner (bar/phrase-aligned edits). Server-to-server: a dedicated service account
// (METADATA_ENGINE_API_KEY). Every failure just returns null so callers fall back to the plain trim.
const fs = require("fs");
const path = require("path");
const { logger } = require("../utils/logger");

const ME_URL = () => (process.env.METADATA_ENGINE_URL || "https://metadata.hardbanrecordslab.online").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.CUTDOWN_PLAN_TIMEOUT_MS || 150000);

/** Best option for `seconds`: length within ~12 % (min 3 s) of the target; higher score wins, a natural ending breaks ties. */
function pickOption(options, seconds) {
  const tol = Math.max(3, seconds * 0.12);
  const ok = (options || []).filter((o) => o && Math.abs(o.duration - seconds) <= tol && o.end > o.start);
  if (!ok.length) return null;
  return ok.sort((a, b) => (b.score + (b.naturalEnd ? 0.05 : 0)) - (a.score + (a.naturalEnd ? 0.05 : 0)))[0];
}

async function planCutdown(filePath, seconds) {
  const key = process.env.METADATA_ENGINE_API_KEY;
  if (!key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const form = new FormData();
    form.append("file", new Blob([await fs.promises.readFile(filePath)], { type: "audio/mpeg" }), "audio" + (path.extname(filePath) || ".mp3"));
    form.append("targets", String(seconds));
    const r = await fetch(`${ME_URL()}/api/intelligence/cutdowns`, { method: "POST", headers: { "X-API-Key": key }, body: form, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const plan = await r.json();
    const item = (plan.cutdowns || []).find((c) => c.target === seconds);
    const pick = pickOption(item && item.options, seconds);
    return pick ? { ...pick, bpm: plan.bpm, tempo: plan.tempo } : null;
  } catch (e) {
    logger.warn(`cutdown planner unavailable (${seconds}s): ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { planCutdown, pickOption };
