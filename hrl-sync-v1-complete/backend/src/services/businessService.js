/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HRL SYNC HUB — BUSINESS SERVICE (B2B / WHITE LABEL / AGENCIES)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { query, queryOne, queryAll } = require('../db/pool');
const { v4: uuidv4 } = require('uuid');

class BusinessService {
    /**
     * WHITE LABEL CHANNELS
     */
    async createChannel(clientId, channelData) {
        const id = uuidv4();
        const sql = `
      INSERT INTO white_label_channels 
      (id, client_id, name, description, channel_type, branding, settings, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *`;
        return queryOne(sql, [
            id, clientId, channelData.name, channelData.description,
            channelData.type, JSON.stringify(channelData.branding || {}),
            JSON.stringify(channelData.settings || {})
        ]);
    }

    async addTracksToChannel(channelId, trackIds) {
        const results = [];
        for (let i = 0; i < trackIds.length; i++) {
            await query(
                `INSERT INTO channel_tracks (id, channel_id, track_id, position, added_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (channel_id, track_id) DO UPDATE SET position = $4`,
                [uuidv4(), channelId, trackIds[i], i + 1]
            );
            results.push(trackIds[i]);
        }
        return results;
    }

    async getChannel(id) {
        const channel = await queryOne(`SELECT * FROM white_label_channels WHERE id = $1`, [id]);
        if (!channel) throw new Error('CHANNEL_NOT_FOUND');
        const tracks = await queryAll(
            `SELECT t.*, ct.position FROM tracks t 
         JOIN channel_tracks ct ON t.id = ct.track_id 
         WHERE ct.channel_id = $1 ORDER BY ct.position ASC`,
            [id]
        );
        return { ...channel, tracks };
    }

    /**
     * AGENCY CONTACT DATABASE
     */
    async addAgency(data) {
        const id = uuidv4();
        const sql = `
      INSERT INTO agencies (id, name, type, country, city, contact_email, website, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
        return queryOne(sql, [id, data.name, data.type, data.country, data.city, data.email, data.website, data.description]);
    }

    async searchAgencies(filters = {}) {
        let sql = `SELECT * FROM agencies WHERE 1=1`;
        const params = [];
        if (filters.type) { params.push(filters.type); sql += ` AND type = $${params.length}`; }
        if (filters.country) { params.push(filters.country); sql += ` AND country = $${params.length}`; }
        return queryAll(sql, params);
    }

    /**
     * B2B CLIENT MANAGEMENT
     */
    async createB2BClient(data) {
        const id = uuidv4();
        const sql = `
      INSERT INTO b2b_clients (id, name, type, industry, contact_email, subscription_tier, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING *`;
        return queryOne(sql, [id, data.name, data.type, data.industry, data.email, data.tier || 'free']);
    }

    async getClientDashboard(clientId) {
        const client = await queryOne(`SELECT * FROM b2b_clients WHERE id = $1`, [clientId]);
        const channelsCount = await queryOne(`SELECT COUNT(*) as count FROM white_label_channels WHERE client_id = $1`, [clientId]);
        return { client, channelsCount: channelsCount.count };
    }
}

module.exports = new BusinessService();
