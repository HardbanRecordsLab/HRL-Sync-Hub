/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HRL SYNC HUB — BUSINESS ROUTES (B2B / WHITE LABEL / AGENCIES)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const businessService = require('../services/businessService');
const authMiddleware = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');

// ── Channels (White Label) ───────────────────────────────────────────────────

router.post('/channels', authMiddleware, async (req, res) => {
    const channel = await businessService.createChannel(req.userId, req.body);
    res.status(201).json(channel);
});

router.get('/channels/:id', async (req, res) => {
    const channel = await businessService.getChannel(req.params.id);
    res.json(channel);
});

router.post('/channels/:id/tracks', authMiddleware, async (req, res) => {
    const results = await businessService.addTracksToChannel(req.params.id, req.body.trackIds);
    res.json({ success: true, added: results.length });
});

// ── Agencies (CRM) ─────────────────────────────────────────────────────────────

router.get('/agencies', authMiddleware, async (req, res) => {
    const agencies = await businessService.searchAgencies(req.query);
    res.json(agencies);
});

router.post('/agencies', authMiddleware, requireAdmin, async (req, res) => {
    const agency = await businessService.addAgency(req.body);
    res.status(201).json(agency);
});

// ── B2B Dashboard ──────────────────────────────────────────────────────────────

router.get('/dashboard', authMiddleware, async (req, res) => {
    const dashboard = await businessService.getClientDashboard(req.userId);
    res.json(dashboard);
});

// ── Embed Player (White Label) ───────────────────────────────────────────────

router.get('/channels/:id/embed', async (req, res) => {
    const { theme = "dark" } = req.query;
    try {
        const channel = await businessService.getChannel(req.params.id);
        const API = process.env.API_URL || `https://${req.hostname}`;

        // Return a custom HTML or reuse the playlist player with channel context
        res.setHeader("Content-Type", "text/html");
        res.setHeader("X-Frame-Options", "ALLOWALL");

        // For now, we'll send a message that this is a premium channel
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { background: ${theme === 'dark' ? '#0A080E' : '#fff'}; color: ${theme === 'dark' ? '#fff' : '#000'}; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { text-align: center; border: 1px solid rgba(255,60,80,0.3); padding: 20px; border-radius: 10px; }
                    .title { font-weight: bold; margin-bottom: 10px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="title">${channel.name}</div>
                    <div style="font-size: 12px; color: #888;">White Label Channel via HRL Sync v2.0</div>
                    <div style="margin-top: 20px; background: #FF3C50; color: #fff; padding: 10px; border-radius: 5px; cursor: pointer;">
                        LAUNCH SECURE PLAYER (${channel.tracks.length} Tracks)
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(404).send("Channel not found");
    }
});

module.exports = router;
