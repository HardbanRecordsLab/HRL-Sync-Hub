/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HRL SYNC HUB — WHITE LABEL CHANNELS + AGENCY DATABASE SYSTEM
 * 
 * BIZNESOWE KANAŁY MUZYCZNE DLA KLIENTÓW
 * - Biura, restauracje, hotele, sklepy, centra fitness
 * - Baza kontaktów agencji muzycznych
 * - Zarządzanie klientami korporacyjnymi
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// ═════════════════════════════════════════════════════════════════════════════════
// 1. WHITE LABEL CHANNEL BUILDER
// ═════════════════════════════════════════════════════════════════════════════════

/**
 * Systemat pozwalający na tworzenie spersonalizowanych kanałów muzycznych
 * dla biznesu (biura, restauracje, hotele, sklepy, fitness, itp.)
 */

class WhiteLabelChannelManager {
  constructor(db, cache) {
    this.db = db;
    this.cache = cache;
  }

  /**
   * Utwórz nowy kanał dla klienta
   */
  async createChannel(clientId, channelData) {
    try {
      const channelId = uuidv4();

      const channel = await this.db.query(
        `INSERT INTO white_label_channels 
         (id, client_id, name, description, channel_type, branding, settings, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *`,
        [
          channelId,
          clientId,
          channelData.name,
          channelData.description,
          channelData.type, // 'office', 'restaurant', 'retail', 'fitness', 'hotel'
          JSON.stringify(channelData.branding || {}),
          JSON.stringify(channelData.settings || {})
        ]
      );

      await this.cache.set(`channel:${channelId}`, channel, 3600);

      return {
        success: true,
        channelId: channel.id,
        channel: {
          name: channel.name,
          type: channel.channel_type,
          description: channel.description,
          accessUrl: `${process.env.APP_URL}/channels/${channel.id}`
        }
      };
    } catch (err) {
      throw new Error(`CREATE_CHANNEL_FAILED: ${err.message}`);
    }
  }

  /**
   * Dodaj utwory do kanału
   */
  async addTracksToChannel(channelId, trackIds) {
    try {
      const results = [];

      for (let i = 0; i < trackIds.length; i++) {
        await this.db.query(
          `INSERT INTO channel_tracks (channel_id, track_id, position, added_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (channel_id, track_id) DO UPDATE SET position = $3`,
          [channelId, trackIds[i], i + 1]
        );

        results.push({
          trackId: trackIds[i],
          added: true
        });
      }

      await this.cache.del(`channel:${channelId}`); // Invalidate cache

      return {
        channelId,
        tracksAdded: results.length,
        results
      };
    } catch (err) {
      throw new Error(`ADD_TRACKS_FAILED: ${err.message}`);
    }
  }

  /**
   * Edytuj kanał
   */
  async updateChannel(channelId, updates) {
    try {
      const channel = await this.db.query(
        `UPDATE white_label_channels 
         SET name = COALESCE($2, name),
             description = COALESCE($3, description),
             branding = COALESCE($4, branding),
             settings = COALESCE($5, settings),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          channelId,
          updates.name,
          updates.description,
          updates.branding ? JSON.stringify(updates.branding) : null,
          updates.settings ? JSON.stringify(updates.settings) : null
        ]
      );

      await this.cache.set(`channel:${channelId}`, channel, 3600);

      return {
        success: true,
        channel
      };
    } catch (err) {
      throw new Error(`UPDATE_CHANNEL_FAILED: ${err.message}`);
    }
  }

  /**
   * Pobierz kanał z metadanymi
   */
  async getChannel(channelId) {
    try {
      // Try cache first
      let cached = await this.cache.get(`channel:${channelId}`);
      if (cached) return JSON.parse(cached);

      const channel = await this.db.query(
        `SELECT c.*,
                COUNT(ct.id) as track_count,
                SUM(t.duration) as total_duration
         FROM white_label_channels c
         LEFT JOIN channel_tracks ct ON c.id = ct.channel_id
         LEFT JOIN tracks t ON ct.track_id = t.id
         WHERE c.id = $1
         GROUP BY c.id`,
        [channelId]
      );

      if (!channel) throw new Error('CHANNEL_NOT_FOUND');

      // Get tracks
      const tracks = await this.db.query(
        `SELECT t.*, ct.position
         FROM channel_tracks ct
         JOIN tracks t ON ct.track_id = t.id
         WHERE ct.channel_id = $1
         ORDER BY ct.position ASC`,
        [channelId]
      );

      const result = {
        ...channel,
        tracks,
        trackCount: channel.track_count,
        totalDuration: channel.total_duration
      };

      await this.cache.set(`channel:${channelId}`, JSON.stringify(result), 3600);

      return result;
    } catch (err) {
      throw new Error(`GET_CHANNEL_FAILED: ${err.message}`);
    }
  }

  /**
   * Ustawienia branding dla kanału
   */
  async setBranding(channelId, brandingData) {
    try {
      const branding = {
        logo: brandingData.logo || null,
        colors: {
          primary: brandingData.primaryColor || '#000000',
          secondary: brandingData.secondaryColor || '#ffffff'
        },
        company: {
          name: brandingData.companyName || '',
          url: brandingData.companyUrl || ''
        },
        customCSS: brandingData.customCSS || null
      };

      await this.db.query(
        `UPDATE white_label_channels 
         SET branding = $2, updated_at = NOW()
         WHERE id = $1`,
        [channelId, JSON.stringify(branding)]
      );

      await this.cache.del(`channel:${channelId}`);

      return {
        success: true,
        branding
      };
    } catch (err) {
      throw new Error(`SET_BRANDING_FAILED: ${err.message}`);
    }
  }

  /**
   * Pobierz wszystkie kanały dla klienta
   */
  async getClientChannels(clientId) {
    try {
      const channels = await this.db.query(
        `SELECT c.*,
                COUNT(ct.id) as track_count,
                COUNT(DISTINCT cv.id) as view_count
         FROM white_label_channels c
         LEFT JOIN channel_tracks ct ON c.id = ct.channel_id
         LEFT JOIN channel_views cv ON c.id = cv.channel_id
         WHERE c.client_id = $1
         GROUP BY c.id
         ORDER BY c.created_at DESC`,
        [clientId]
      );

      return {
        clientId,
        channelCount: channels.length,
        channels
      };
    } catch (err) {
      throw new Error(`GET_CLIENT_CHANNELS_FAILED: ${err.message}`);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════════
// 2. AGENCY CONTACT DATABASE
// ═════════════════════════════════════════════════════════════════════════════════

/**
 * Baza kontaktów agencji muzycznych, promów, event organizerów
 */

class AgencyContactManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Dodaj nową agencję do bazy
   */
  async addAgency(agencyData) {
    try {
      const agencyId = uuidv4();

      const agency = await this.db.query(
        `INSERT INTO agencies 
         (id, name, type, country, city, contact_email, contact_phone, 
          contact_person, website, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          agencyId,
          agencyData.name,
          agencyData.type, // 'music', 'production', 'event', 'talent', 'sound_design'
          agencyData.country,
          agencyData.city,
          agencyData.email,
          agencyData.phone,
          agencyData.contactPerson,
          agencyData.website,
          agencyData.description,
          JSON.stringify(agencyData.metadata || {})
        ]
      );

      return {
        success: true,
        agencyId: agency.id,
        agency
      };
    } catch (err) {
      throw new Error(`ADD_AGENCY_FAILED: ${err.message}`);
    }
  }

  /**
   * Wyszukaj agencje
   */
  async searchAgencies(filters = {}) {
    try {
      let query = `SELECT * FROM agencies WHERE 1=1`;
      const params = [];
      let paramIdx = 1;

      if (filters.type) {
        query += ` AND type = $${paramIdx++}`;
        params.push(filters.type);
      }

      if (filters.country) {
        query += ` AND country = $${paramIdx++}`;
        params.push(filters.country);
      }

      if (filters.city) {
        query += ` AND city ILIKE $${paramIdx++}`;
        params.push(`%${filters.city}%`);
      }

      if (filters.name) {
        query += ` AND name ILIKE $${paramIdx++}`;
        params.push(`%${filters.name}%`);
      }

      if (filters.serviceType) {
        query += ` AND metadata->>'services' ILIKE $${paramIdx++}`;
        params.push(`%${filters.serviceType}%`);
      }

      query += ` ORDER BY created_at DESC LIMIT 100`;

      const agencies = await this.db.query(query, params);

      return {
        count: agencies.length,
        agencies
      };
    } catch (err) {
      throw new Error(`SEARCH_AGENCIES_FAILED: ${err.message}`);
    }
  }

  /**
   * Pobierz pełne dane agencji
   */
  async getAgency(agencyId) {
    try {
      const agency = await this.db.query(
        `SELECT a.*,
                COUNT(DISTINCT c.id) as contact_count,
                COUNT(DISTINCT i.id) as interaction_count
         FROM agencies a
         LEFT JOIN agency_contacts ac ON a.id = ac.agency_id
         LEFT JOIN contacts c ON ac.contact_id = c.id
         LEFT JOIN agency_interactions i ON a.id = i.agency_id
         WHERE a.id = $1
         GROUP BY a.id`,
        [agencyId]
      );

      if (!agency) throw new Error('AGENCY_NOT_FOUND');

      // Get related contacts
      const contacts = await this.db.query(
        `SELECT c.* FROM contacts c
         JOIN agency_contacts ac ON c.id = ac.contact_id
         WHERE ac.agency_id = $1`,
        [agencyId]
      );

      return {
        ...agency,
        contacts
      };
    } catch (err) {
      throw new Error(`GET_AGENCY_FAILED: ${err.message}`);
    }
  }

  /**
   * Dodaj kontakt do agencji
   */
  async addContactToAgency(agencyId, contactData) {
    try {
      const contactId = uuidv4();

      const contact = await this.db.query(
        `INSERT INTO contacts 
         (id, name, email, phone, position, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          contactId,
          contactData.name,
          contactData.email,
          contactData.phone,
          contactData.position,
          contactData.notes
        ]
      );

      await this.db.query(
        `INSERT INTO agency_contacts (agency_id, contact_id)
         VALUES ($1, $2)`,
        [agencyId, contactId]
      );

      return {
        success: true,
        contact
      };
    } catch (err) {
      throw new Error(`ADD_CONTACT_FAILED: ${err.message}`);
    }
  }

  /**
   * Śledź interakcje z agencją
   */
  async trackInteraction(agencyId, interactionData) {
    try {
      const interaction = await this.db.query(
        `INSERT INTO agency_interactions 
         (id, agency_id, type, description, date, follow_up_date, notes)
         VALUES ($1, $2, $3, $4, NOW(), $5, $6)
         RETURNING *`,
        [
          uuidv4(),
          agencyId,
          interactionData.type, // 'email', 'call', 'meeting', 'demo', 'proposal'
          interactionData.description,
          interactionData.followUpDate,
          interactionData.notes
        ]
      );

      return {
        success: true,
        interaction
      };
    } catch (err) {
      throw new Error(`TRACK_INTERACTION_FAILED: ${err.message}`);
    }
  }

  /**
   * Pobierz historię interakcji
   */
  async getInteractionHistory(agencyId) {
    try {
      const history = await this.db.query(
        `SELECT * FROM agency_interactions 
         WHERE agency_id = $1
         ORDER BY date DESC`,
        [agencyId]
      );

      return {
        agencyId,
        interactions: history
      };
    } catch (err) {
      throw new Error(`GET_INTERACTION_HISTORY_FAILED: ${err.message}`);
    }
  }

  /**
   * Eksport listy agencji do CSV
   */
  async exportAgenciesToCSV(filters = {}) {
    try {
      const agencies = await this.searchAgencies(filters);

      const csv = [
        'ID,Nazwa,Typ,Kraj,Miasto,Email,Telefon,Osoba Kontaktowa,Strona,Opis',
        ...agencies.agencies.map(a =>
          `${a.id},"${a.name}",${a.type},${a.country},${a.city},${a.contact_email},${a.contact_phone},"${a.contact_person}",${a.website},"${a.description}"`
        )
      ].join('\n');

      return {
        success: true,
        data: csv,
        filename: `agencies-export-${Date.now()}.csv`
      };
    } catch (err) {
      throw new Error(`EXPORT_FAILED: ${err.message}`);
    }
  }

  /**
   * Dodaj masowo agencje z CSV
   */
  async importAgenciesFromCSV(csvData) {
    try {
      const lines = csvData.split('\n');
      const headers = lines[0].split(',');
      const results = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        
        const agencyData = {
          name: values[1]?.replace(/"/g, ''),
          type: values[2],
          country: values[3],
          city: values[4],
          email: values[5],
          phone: values[6],
          contactPerson: values[7]?.replace(/"/g, ''),
          website: values[8],
          description: values[9]?.replace(/"/g, '')
        };

        try {
          const result = await this.addAgency(agencyData);
          results.push({ success: true, agencyId: result.agencyId });
        } catch (err) {
          results.push({ success: false, error: err.message });
        }
      }

      return {
        imported: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
    } catch (err) {
      throw new Error(`IMPORT_FAILED: ${err.message}`);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════════
// 3. B2B CLIENT MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════════

/**
 * Zarządzanie klientami korporacyjnymi
 * (Biura, restauracje, hotele, sklepy, fitness)
 */

class B2BClientManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Utwórz nowego klienta B2B
   */
  async createClient(clientData) {
    try {
      const clientId = uuidv4();

      const client = await this.db.query(
        `INSERT INTO b2b_clients 
         (id, name, type, industry, country, city, address, 
          contact_email, contact_phone, contact_person, 
          company_size, subscription_tier, status, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          clientId,
          clientData.name,
          clientData.type, // 'office', 'restaurant', 'hotel', 'retail', 'fitness', 'medical', 'education'
          clientData.industry,
          clientData.country,
          clientData.city,
          clientData.address,
          clientData.email,
          clientData.phone,
          clientData.contactPerson,
          clientData.companySize,
          clientData.subscriptionTier || 'free', // free, starter, professional, enterprise
          'active',
          JSON.stringify(clientData.metadata || {})
        ]
      );

      return {
        success: true,
        clientId: client.id,
        client
      };
    } catch (err) {
      throw new Error(`CREATE_CLIENT_FAILED: ${err.message}`);
    }
  }

  /**
   * Pobierz dashboard klienta
   */
  async getClientDashboard(clientId) {
    try {
      const client = await this.db.query(
        `SELECT * FROM b2b_clients WHERE id = $1`,
        [clientId]
      );

      if (!client) throw new Error('CLIENT_NOT_FOUND');

      // Get channels
      const channels = await this.db.query(
        `SELECT COUNT(*) as count FROM white_label_channels WHERE client_id = $1`,
        [clientId]
      );

      // Get active users/listeners
      const listeners = await this.db.query(
        `SELECT COUNT(DISTINCT user_id) as count 
         FROM channel_listeners
         WHERE channel_id IN (
           SELECT id FROM white_label_channels WHERE client_id = $1
         )`,
        [clientId]
      );

      // Get usage stats
      const stats = await this.db.query(
        `SELECT 
          COUNT(*) as total_plays,
          COUNT(DISTINCT user_id) as unique_users,
          AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_duration
         FROM channel_plays
         WHERE channel_id IN (
           SELECT id FROM white_label_channels WHERE client_id = $1
         )`,
        [clientId]
      );

      return {
        client,
        channels: channels[0].count,
        listeners: listeners[0].count,
        stats: {
          totalPlays: stats[0].total_plays,
          uniqueUsers: stats[0].unique_users,
          avgDuration: stats[0].avg_duration
        }
      };
    } catch (err) {
      throw new Error(`GET_CLIENT_DASHBOARD_FAILED: ${err.message}`);
    }
  }

  /**
   * Upgrade subscriptions dla klienta
   */
  async upgradeSubscription(clientId, newTier) {
    try {
      const tierConfig = {
        free: { channels: 1, locations: 1, price: 0 },
        starter: { channels: 3, locations: 3, price: 49 },
        professional: { channels: 10, locations: 10, price: 149 },
        enterprise: { channels: 'unlimited', locations: 'unlimited', price: 'custom' }
      };

      const client = await this.db.query(
        `UPDATE b2b_clients 
         SET subscription_tier = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [clientId, newTier]
      );

      return {
        success: true,
        client,
        newLimits: tierConfig[newTier]
      };
    } catch (err) {
      throw new Error(`UPGRADE_SUBSCRIPTION_FAILED: ${err.message}`);
    }
  }

  /**
   * Pobierz użytkowników/lokalizacje dla klienta
   */
  async getClientLocations(clientId) {
    try {
      const locations = await this.db.query(
        `SELECT c.*, 
                COUNT(DISTINCT cl.user_id) as listener_count,
                COUNT(DISTINCT cp.id) as play_count
         FROM white_label_channels c
         LEFT JOIN channel_listeners cl ON c.id = cl.channel_id
         LEFT JOIN channel_plays cp ON c.id = cp.channel_id
         WHERE c.client_id = $1
         GROUP BY c.id`,
        [clientId]
      );

      return {
        clientId,
        locationCount: locations.length,
        locations
      };
    } catch (err) {
      throw new Error(`GET_LOCATIONS_FAILED: ${err.message}`);
    }
  }

  /**
   * Pobierz analitykę dla klienta
   */
  async getClientAnalytics(clientId, dateFrom, dateTo) {
    try {
      const analytics = await this.db.query(
        `SELECT 
          DATE(cp.play_date) as date,
          COUNT(*) as play_count,
          COUNT(DISTINCT cl.user_id) as unique_listeners,
          AVG(t.duration) as avg_track_duration
         FROM channel_plays cp
         JOIN channel_listeners cl ON cp.user_id = cl.user_id
         JOIN tracks t ON cp.track_id = t.id
         WHERE cp.channel_id IN (
           SELECT id FROM white_label_channels WHERE client_id = $1
         )
         AND cp.play_date >= $2
         AND cp.play_date <= $3
         GROUP BY DATE(cp.play_date)
         ORDER BY date ASC`,
        [clientId, dateFrom, dateTo]
      );

      return {
        clientId,
        period: { from: dateFrom, to: dateTo },
        analytics
      };
    } catch (err) {
      throw new Error(`GET_ANALYTICS_FAILED: ${err.message}`);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════════
// 4. SALES & OUTREACH TOOLS
// ═════════════════════════════════════════════════════════════════════════════════

/**
 * Narzędzia do sprzedaży i outreachów do potencjalnych klientów
 */

class SalesOutreachManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Utwórz kampanię outreachową
   */
  async createOutreachCampaign(campaignData) {
    try {
      const campaignId = uuidv4();

      const campaign = await this.db.query(
        `INSERT INTO outreach_campaigns 
         (id, name, target_type, target_count, message_template, 
          status, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          campaignId,
          campaignData.name,
          campaignData.targetType, // 'agencies', 'businesses', 'specific'
          campaignData.targetCount,
          campaignData.messageTemplate,
          'draft',
          campaignData.startDate,
          campaignData.endDate
        ]
      );

      return {
        success: true,
        campaignId: campaign.id,
        campaign
      };
    } catch (err) {
      throw new Error(`CREATE_CAMPAIGN_FAILED: ${err.message}`);
    }
  }

  /**
   * Wyślij kampanię outreachową
   */
  async launchCampaign(campaignId, targetList) {
    try {
      const results = [];

      for (const target of targetList) {
        const messageId = uuidv4();

        // Save outreach message
        await this.db.query(
          `INSERT INTO outreach_messages 
           (id, campaign_id, recipient_email, recipient_name, 
            subject, body, status, sent_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            messageId,
            campaignId,
            target.email,
            target.name,
            `HRL Sync Hub - Platforma Muzyczna Dla Twojej Firmy`,
            `Personalized message for ${target.name}...`,
            'sent'
          ]
        );

        // Send email
        await this.sendOutreachEmail(target.email, target.name, campaignId);

        results.push({
          email: target.email,
          status: 'sent'
        });
      }

      // Update campaign status
      await this.db.query(
        `UPDATE outreach_campaigns SET status = $2 WHERE id = $1`,
        [campaignId, 'launched']
      );

      return {
        campaignId,
        sent: results.length,
        results
      };
    } catch (err) {
      throw new Error(`LAUNCH_CAMPAIGN_FAILED: ${err.message}`);
    }
  }

  /**
   * Wyślij email outreachowy
   */
  async sendOutreachEmail(email, name, campaignId) {
    // Integration z mailgun/sendgrid
    try {
      const response = await axios.post(
        `${process.env.MAIL_API_URL}/messages`,
        {
          from: 'sales@hrlsync.com',
          to: email,
          subject: 'HRL Sync Hub - Odkryj muzykę dla Twojej firmy',
          html: this.getOutreachEmailTemplate(name)
        }
      );

      return {
        success: true,
        messageId: response.data.id
      };
    } catch (err) {
      throw new Error(`SEND_EMAIL_FAILED: ${err.message}`);
    }
  }

  getOutreachEmailTemplate(name) {
    return `
      <html>
        <body style="font-family: Arial, sans-serif;">
          <h2>Cześć ${name}! 👋</h2>
          
          <p>Znaleźliśmy Ciebie, bo wiemy, że w Twojej firme potrzebujecie muzyki.</p>
          
          <h3>HRL Sync Hub to:</h3>
          <ul>
            <li>✅ Białe kanały muzyczne (bez reklam)</li>
            <li>✅ Tysięcy profesjonalnych utworów</li>
            <li>✅ Pełna kontrola nad repertuarem</li>
            <li>✅ Legalne i bezpieczne dla Twojej firmy</li>
            <li>✅ Wsparcie dla artystów</li>
          </ul>
          
          <p><strong>Zainteresowany?</strong></p>
          <p><a href="https://app.hrlsync.com/schedule-demo">Zarezerwuj bezpłatną demo → </a></p>
          
          <p>Lub napisz do nas: <strong>sales@hrlsync.com</strong></p>
          
          <hr>
          <p style="color: #666; font-size: 12px;">
            HRL Sync Hub - Muzyka dla Twojej Firmy
          </p>
        </body>
      </html>
    `;
  }

  /**
   * Śledź konwersje kampanii
   */
  async trackCampaignConversion(campaignId, email, action) {
    try {
      await this.db.query(
        `INSERT INTO campaign_conversions 
         (campaign_id, email, action, timestamp)
         VALUES ($1, $2, $3, NOW())`,
        [campaignId, email, action] // action: 'opened', 'clicked', 'signed_up'
      );

      return {
        success: true,
        tracked: true
      };
    } catch (err) {
      throw new Error(`TRACK_CONVERSION_FAILED: ${err.message}`);
    }
  }

  /**
   * Pobierz metryki kampanii
   */
  async getCampaignMetrics(campaignId) {
    try {
      const metrics = await this.db.query(
        `SELECT 
          (SELECT COUNT(*) FROM outreach_messages WHERE campaign_id = $1) as sent,
          (SELECT COUNT(*) FROM campaign_conversions WHERE campaign_id = $1 AND action = 'opened') as opened,
          (SELECT COUNT(*) FROM campaign_conversions WHERE campaign_id = $1 AND action = 'clicked') as clicked,
          (SELECT COUNT(*) FROM campaign_conversions WHERE campaign_id = $1 AND action = 'signed_up') as signed_up
        `,
        [campaignId]
      );

      const m = metrics[0];
      const openRate = m.sent > 0 ? ((m.opened / m.sent) * 100).toFixed(2) : 0;
      const clickRate = m.sent > 0 ? ((m.clicked / m.sent) * 100).toFixed(2) : 0;
      const conversionRate = m.sent > 0 ? ((m.signed_up / m.sent) * 100).toFixed(2) : 0;

      return {
        campaignId,
        sent: m.sent,
        opened: m.opened,
        clicked: m.clicked,
        signedUp: m.signed_up,
        openRate: `${openRate}%`,
        clickRate: `${clickRate}%`,
        conversionRate: `${conversionRate}%`
      };
    } catch (err) {
      throw new Error(`GET_METRICS_FAILED: ${err.message}`);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════════
// 5. UNIFIED PLATFORM MANAGER
// ═════════════════════════════════════════════════════════════════════════════════

class B2BPlatformManager {
  constructor(db, cache) {
    this.channels = new WhiteLabelChannelManager(db, cache);
    this.agencies = new AgencyContactManager(db);
    this.clients = new B2BClientManager(db);
    this.sales = new SalesOutreachManager(db);
  }

  /**
   * Kompleksowy onboarding nowego klienta
   */
  async onboardNewClient(clientData) {
    try {
      // 1. Create B2B client
      const clientResult = await this.clients.createClient(clientData);
      const clientId = clientResult.clientId;

      // 2. Create default channel
      const channelResult = await this.channels.createChannel(clientId, {
        name: `${clientData.name} - Main Channel`,
        description: `Kanał muzyczny dla ${clientData.name}`,
        type: clientData.type,
        branding: {
          companyName: clientData.name,
          companyUrl: clientData.website || ''
        }
      });

      // 3. Add default playlist (popular background music)
      const defaultTracks = await this.getDefaultPlaylist(clientData.type);
      await this.channels.addTracksToChannel(channelResult.channelId, defaultTracks);

      // 4. Create outreach interaction record
      await this.agencies.trackInteraction(clientId, {
        type: 'demo',
        description: 'Client onboarding completed',
        notes: `${clientData.type} in ${clientData.city}`
      });

      return {
        success: true,
        clientId,
        channelId: channelResult.channelId,
        nextSteps: [
          'Customize channel branding',
          'Add more tracks',
          'Configure payment method',
          'Invite team members'
        ]
      };
    } catch (err) {
      throw new Error(`ONBOARD_CLIENT_FAILED: ${err.message}`);
    }
  }

  /**
   * Pobierz domyślną playlistę dla typu biznesu
   */
  async getDefaultPlaylist(businessType) {
    // Return popular tracks for business type
    // office -> background work music
    // restaurant -> ambient dining music
    // hotel -> lobby/ambient music
    // retail -> upbeat shopping music
    // fitness -> energetic workout music

    const playlists = {
      office: ['track_1', 'track_2', 'track_3'], // background work tracks
      restaurant: ['track_4', 'track_5', 'track_6'], // ambient dining
      hotel: ['track_7', 'track_8', 'track_9'], // elegant lobby
      retail: ['track_10', 'track_11', 'track_12'], // upbeat shopping
      fitness: ['track_13', 'track_14', 'track_15'], // energetic workout
      medical: ['track_16', 'track_17', 'track_18'] // calm/relaxing
    };

    return playlists[businessType] || playlists.office;
  }
}

// ═════════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════════════════════

module.exports = {
  WhiteLabelChannelManager,
  AgencyContactManager,
  B2BClientManager,
  SalesOutreachManager,
  B2BPlatformManager
};

// ═════════════════════════════════════════════════════════════════════════════════
// DATABASE SCHEMA REQUIRED
// ═════════════════════════════════════════════════════════════════════════════════

/*

CREATE TABLE white_label_channels (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES b2b_clients(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  channel_type VARCHAR(50),
  branding JSONB,
  settings JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE channel_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES white_label_channels(id),
  track_id UUID NOT NULL REFERENCES tracks(id),
  position INT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, track_id)
);

CREATE TABLE agencies (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  country VARCHAR(100),
  city VARCHAR(100),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  contact_person VARCHAR(255),
  website VARCHAR(255),
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  UNIQUE(agency_id, contact_id)
);

CREATE TABLE contacts (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  position VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agency_interactions (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  type VARCHAR(50),
  description TEXT,
  date TIMESTAMPTZ,
  follow_up_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE b2b_clients (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  industry VARCHAR(100),
  country VARCHAR(100),
  city VARCHAR(100),
  address TEXT,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  contact_person VARCHAR(255),
  company_size VARCHAR(50),
  subscription_tier VARCHAR(50),
  status VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE channel_listeners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES white_label_channels(id),
  user_id UUID,
  ip_address INET,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE channel_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES white_label_channels(id),
  track_id UUID NOT NULL REFERENCES tracks(id),
  user_id UUID,
  play_date TIMESTAMPTZ DEFAULT NOW(),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ
);

CREATE TABLE outreach_campaigns (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  target_type VARCHAR(50),
  target_count INT,
  message_template TEXT,
  status VARCHAR(50),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE outreach_messages (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id),
  recipient_email VARCHAR(255),
  recipient_name VARCHAR(255),
  subject VARCHAR(255),
  body TEXT,
  status VARCHAR(50),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
);

CREATE TABLE campaign_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id),
  email VARCHAR(255),
  action VARCHAR(50),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

*/
