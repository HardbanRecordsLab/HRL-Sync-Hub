/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HRL SYNC HUB — AI SERVICE (GROQ & GEMINI)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { Groq } = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logger } = require('../utils/logger');

// Initialize clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class AIService {
    /**
     * Fast text analysis/chat using Groq (Llama 3 70B/8B)
     */
    async quickChat(prompt, systemMessage = "You are a helpful assistant for HRL Sync Hub, a music distribution and management platform.") {
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: prompt }
                ],
                model: 'llama3-70b-8192',
            });
            return completion.choices[0].message.content;
        } catch (e) {
            logger.error('Groq AI Error:', e.message);
            throw new Error('AI_SERVICE_UNAVAILABLE');
        }
    }

    /**
     * Deep analysis/Generation using Gemini 1.5 Pro
     */
    async deepAnalysis(prompt) {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (e) {
            logger.error('Gemini AI Error:', e.message);
            throw new Error('AI_SERVICE_UNAVAILABLE');
        }
    }

    /**
     * Mood and Genre detection for tracks
     */
    async detectMoodAndGenre(trackMetadata) {
        const prompt = `Analyze this track metadata and suggest 3 genres and 2 moods:
    Title: ${trackMetadata.title}
    Artist: ${trackMetadata.artist}
    Description: ${trackMetadata.description || 'N/A'}
    BPM: ${trackMetadata.bpm || 'N/A'}
    Key: ${trackMetadata.key || 'N/A'}
    
    Return JSON format: { "genres": ["...", "...", "..."], "moods": ["...", "..."] }`;

        const response = await this.quickChat(prompt, "You are a music industry expert analyzer.");
        try {
            // Extract JSON from response if there's markdown wrappings
            const jsonStr = response.match(/\{[\s\S]*\}/)?.[0] || response;
            return JSON.parse(jsonStr);
        } catch (e) {
            return { genres: [], moods: [] };
        }
    }

    /**
     * Generate Marketing Copy for a White Label Channel
     */
    async generateChannelPitch(channelName, businessType, description) {
        const prompt = `Generate a 2-paragraph marketing pitch for a custom music channel named "${channelName}" for a ${businessType}. 
    Philosophy: ${description}`;
        return this.deepAnalysis(prompt);
    }
}

module.exports = new AIService();
