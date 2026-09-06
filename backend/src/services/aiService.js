/**
 * AI via OpenRouter (OpenAI-compatible). Fully optional.
 *
 *   OPENROUTER_API_KEY   — required to enable AI features
 *   AI_MODELS            — comma-separated model ids, tried in order.
 *                          If unset, the live free-model list is fetched from
 *                          OpenRouter and cached, so it self-heals as the
 *                          catalogue changes.
 */
const { logger } = require("../utils/logger");

const BASE = "https://openrouter.ai/api/v1";

// Last-resort static list (used only if the live fetch fails).
const STATIC_FALLBACK = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "minimax/minimax-m3:free",
  "deepseek/deepseek-chat",
];

// Families that reliably follow instructions / emit clean JSON, best first.
const PREFERRED = ["google/gemma", "nvidia/nemotron-3-super", "nvidia/nemotron-3-ultra", "minimax/minimax-m3", "meta-llama/llama", "qwen/", "deepseek/", "mistralai/"];

let _cache = { at: 0, list: null };

function headers() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.API_URL || "https://hrl-sync.hardbanrecordslab.online",
    "X-Title": "HRL Sync Hub",
  };
}

async function discoverModels() {
  if (_cache.list && Date.now() - _cache.at < 3600_000) return _cache.list;
  try {
    const res = await fetch(`${BASE}/models`, { headers: headers() });
    const data = (await res.json()).data || [];
    const free = data.map((m) => m.id).filter((id) => id.endsWith(":free"));
    const score = (id) => {
      const i = PREFERRED.findIndex((p) => id.startsWith(p));
      return i === -1 ? 99 : i;
    };
    const list = [...free.sort((a, b) => score(a) - score(b)).slice(0, 4), "deepseek/deepseek-chat"];
    _cache = { at: Date.now(), list };
    logger.info(`AI: discovered models → ${list.join(", ")}`);
    return list;
  } catch (e) {
    logger.warn(`AI: model discovery failed (${e.message}), using static fallback`);
    return STATIC_FALLBACK;
  }
}

async function models() {
  const env = (process.env.AI_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return env.length ? env : discoverModels();
}

class AIService {
  get available() {
    return !!process.env.OPENROUTER_API_KEY;
  }

  async chat(prompt, system = "You are a music supervisor and metadata expert for a sync-licensing library.") {
    if (!process.env.OPENROUTER_API_KEY) {
      const err = new Error("AI_NOT_CONFIGURED");
      err.status = 503;
      throw err;
    }

    const body = {
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    };

    let lastErr;
    for (const model of await models()) {
      try {
        const res = await fetch(`${BASE}/chat/completions`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ ...body, model }),
        });
        if (!res.ok) {
          lastErr = new Error(`${model} → HTTP ${res.status}`);
          logger.warn(`AI: ${lastErr.message}, trying next model`);
          continue;
        }
        const text = (await res.json()).choices?.[0]?.message?.content;
        if (text) return text;
        lastErr = new Error(`${model} → empty response`);
      } catch (e) {
        lastErr = e;
        logger.warn(`AI: ${model} failed (${e.message}), trying next model`);
      }
    }
    const err = new Error(`AI_ALL_MODELS_FAILED: ${lastErr?.message || "unknown"}`);
    err.status = 502;
    throw err;
  }

  async detectMoodAndGenre(track) {
    const prompt = `Analyze this track and suggest genres and moods.
Title: ${track.title}
Artist: ${track.artist}
Description: ${track.description || "N/A"}
BPM: ${track.bpm || "N/A"}
Key: ${track.key || "N/A"}
Reply with ONLY strict JSON: {"genres":["..","..",".."],"moods":["..",".."]}`;

    try {
      const raw = await this.chat(prompt);
      const json = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
      const parsed = JSON.parse(json);
      return {
        genres: Array.isArray(parsed.genres) ? parsed.genres.slice(0, 5) : [],
        moods: Array.isArray(parsed.moods) ? parsed.moods.slice(0, 4) : [],
      };
    } catch (e) {
      logger.warn("AI mood/genre detection failed: " + e.message);
      return { genres: [], moods: [], error: e.message };
    }
  }

  async generateChannelPitch(channelName, businessType, description) {
    return this.chat(
      `Write a 2-paragraph marketing pitch for a curated music channel "${channelName}" for a ${businessType}. Philosophy: ${description}`,
      "You are a senior music-branding copywriter."
    );
  }
}

module.exports = new AIService();
