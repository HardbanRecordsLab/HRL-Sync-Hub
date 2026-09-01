/**
 * AI service (Groq + Gemini) — fully optional. If the API keys are absent the
 * service degrades gracefully instead of crashing the process at boot.
 */
const { logger } = require("../utils/logger");

let _groq = null;
let _gemini = null;

function groq() {
  if (_groq === null) {
    if (!process.env.GROQ_API_KEY) return null;
    const { Groq } = require("groq-sdk");
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

function gemini() {
  if (_gemini === null) {
    if (!process.env.GEMINI_API_KEY) return null;
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _gemini;
}

class AIService {
  get available() {
    return !!(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);
  }

  async quickChat(prompt, systemMessage = "You are a helpful assistant for HRL Sync, a music sync-licensing library.") {
    const client = groq();
    if (!client) {
      const err = new Error("AI_NOT_CONFIGURED");
      err.status = 503;
      throw err;
    }
    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt },
      ],
      model: "llama-3.3-70b-versatile",
    });
    return completion.choices[0].message.content;
  }

  async deepAnalysis(prompt) {
    const client = gemini();
    if (!client) {
      const err = new Error("AI_NOT_CONFIGURED");
      err.status = 503;
      throw err;
    }
    const model = client.getGenerativeModel({ model: "gemini-1.5-pro" });
    const result = await model.generateContent(prompt);
    return (await result.response).text();
  }

  async detectMoodAndGenre(trackMetadata) {
    const prompt = `Analyze this track metadata and suggest 3 genres and 2 moods.
Title: ${trackMetadata.title}
Artist: ${trackMetadata.artist}
Description: ${trackMetadata.description || "N/A"}
BPM: ${trackMetadata.bpm || "N/A"}
Key: ${trackMetadata.key || "N/A"}
Return strict JSON: { "genres": ["..","..",".."], "moods": ["..",".."] }`;

    try {
      const response = await this.quickChat(prompt, "You are a music supervisor and metadata expert.");
      const jsonStr = response.match(/\{[\s\S]*\}/)?.[0] || response;
      return JSON.parse(jsonStr);
    } catch (e) {
      logger.warn("AI mood/genre detection failed: " + e.message);
      return { genres: [], moods: [] };
    }
  }

  async generateChannelPitch(channelName, businessType, description) {
    return this.deepAnalysis(
      `Write a 2-paragraph marketing pitch for a curated music channel named "${channelName}" for a ${businessType}. Philosophy: ${description}`
    );
  }
}

module.exports = new AIService();
