/**
 * AI service via OpenRouter (OpenAI-compatible). Fully optional.
 *
 *   OPENROUTER_API_KEY   — required to enable AI features
 *   AI_MODELS            — comma-separated model ids, tried in order.
 *                          Default: free models first, one cheap paid fallback.
 *
 * Free ":free" models rate-limit / go offline often, so we walk the list until
 * one answers.
 */
const { logger } = require("../utils/logger");

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "google/gemini-2.0-flash-exp:free",
  "google/gemini-2.0-flash-001", // cheap, fast, reliable JSON — paid fallback
];

function models() {
  const env = (process.env.AI_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return env.length ? env : DEFAULT_MODELS;
}

class AIService {
  get available() {
    return !!process.env.OPENROUTER_API_KEY;
  }

  async chat(prompt, system = "You are a music supervisor and metadata expert for a sync-licensing library.") {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
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
    for (const model of models()) {
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.API_URL || "https://hrl-sync.hardbanrecordslab.online",
            "X-Title": "HRL Sync Hub",
          },
          body: JSON.stringify({ ...body, model }),
        });
        if (!res.ok) {
          lastErr = new Error(`${model} → HTTP ${res.status}`);
          logger.warn(`AI: ${lastErr.message}, trying next model`);
          continue;
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
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
      return { genres: [], moods: [] };
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
