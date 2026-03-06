# 🚀 HRL SYNC HUB PREMIUM PRO — QUICK START GUIDE

**Czas do działającej aplikacji:** 1-2 dni  
**Zawartość:** Kluczowe integracje + Payment System

---

## ⚡ FAZA 1: SETUP (30 minut)

### 1.1 Zainstaluj wymagane paczki

```bash
cd backend
npm install --save \
  helmet@^8.0.0 \
  express-rate-limit@^7.0.0 \
  jsonwebtoken@^9.0.0 \
  bcryptjs@^2.4.3 \
  crypto@^1.0.1 \
  stripe@^13.0.0 \
  spotify-web-api-node@^5.0.0 \
  axios@^1.6.0 \
  dotenv@^16.3.1

cd ../frontend
npm install --save \
  zustand@^4.4.0 \
  react-query@^5.0.0 \
  -save-dev typescript@latest
```

### 1.2 Utwórz .env w backend

```bash
# ═══════════════════════════════════════════════
# SECURITY
# ═══════════════════════════════════════════════
NODE_ENV=production
PORT=3001
ALLOWED_ORIGINS=https://app.example.com,https://app-staging.example.com

# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your_32_byte_key_here_minimum_32_chars_long
JWT_SECRET=your_32_byte_secret_key_here_minimum_32_chars_long
JWT_REFRESH_SECRET=your_separate_refresh_secret_minimum_32_chars

# ═══════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════
DATABASE_URL=postgresql://user:password@localhost:5432/hrlsync
DATABASE_SSL=true
DB_POOL_MIN=5
DB_POOL_MAX=20

# ═══════════════════════════════════════════════
# REDIS (для cache & queue)
# ═══════════════════════════════════════════════
REDIS_URL=redis://localhost:6379

# ═══════════════════════════════════════════════
# STRIPE
# ═══════════════════════════════════════════════
STRIPE_SECRET_KEY=sk_live_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# ═══════════════════════════════════════════════
# SPOTIFY
# ═══════════════════════════════════════════════
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://api.example.com/api/integrations/spotify/callback

# ═══════════════════════════════════════════════
# APPLE MUSIC
# ═══════════════════════════════════════════════
APPLE_TEAM_ID=your_apple_team_id
APPLE_KEY_ID=your_apple_key_id
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----

# ═══════════════════════════════════════════════
# YOUTUBE
# ═══════════════════════════════════════════════
YOUTUBE_API_KEY=your_youtube_api_key

# ═══════════════════════════════════════════════
# EMAIL
# ═══════════════════════════════════════════════
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@hrlsync.com

# ═══════════════════════════════════════════════
# MONITORING
# ═══════════════════════════════════════════════
SENTRY_DSN=your_sentry_dsn_url
LOG_LEVEL=info
```

### 1.3 Migruj bazę danych

```bash
# Utwórz nowe tabele i indeksy
psql -U postgres -d hrlsync < db/migrations/001_initial_schema.sql
psql -U postgres -d hrlsync < db/migrations/002_security_enhancements.sql
psql -U postgres -d hrlsync < db/migrations/003_payment_system.sql
psql -U postgres -d hrlsync < db/migrations/004_integrations.sql

# Weryfikuj
psql -U postgres -d hrlsync -c "\dt"
```

---

## ⚡ FAZA 2: SECURITY (1 godzina)

### 2.1 Aktualizacja src/index.js

```javascript
// Zamień stary helmet i auth middleware na nowy

const express = require('express');
const { setupSecurityMiddleware } = require('./security/setup');

const app = express();

// ✅ Zamiast starego setup-u:
const {
  rateLimitManager,
  encryptionManager,
  jwtManager,
  authMiddleware
} = setupSecurityMiddleware(app);

// Teraz wszystkie security features są aktywne:
// ✅ Helmet z CSP
// ✅ Rate limiting
// ✅ JWT token management
// ✅ Data encryption
// ✅ Input validation

// ═════════════════════════════════════════════════
// PROTECTED ROUTES
// ═════════════════════════════════════════════════

const authRoutes = require('./routes/auth');
const integrationsRoutes = require('./routes/integrations');
const billingRoutes = require('./routes/billing');

app.use('/api/auth', authRoutes);
app.use('/api/integrations', authMiddleware.verifyToken, integrationsRoutes);
app.use('/api/billing', authMiddleware.verifyToken, billingRoutes);

// ═════════════════════════════════════════════════
// WEBHOOKS (bez auth)
// ═════════════════════════════════════════════════

const webhookRoutes = require('./routes/webhooks');
app.use('/api/webhooks', webhookRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔐 HRL Sync API — port ${PORT} (Secure Mode)`);
});
```

### 2.2 Nowe routes/auth.js

```javascript
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { JWTManager } = require('../security/setup');

const router = express.Router();
const jwtManager = new JWTManager();

// ✅ REGISTER
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 12 }),
  body('fullName').trim().isLength({ min: 2 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { email, password, fullName } = req.body;

    // Check if user exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      return res.status(409).json({ error: 'USER_EXISTS' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await db.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name`,
      [email, passwordHash, fullName]
    );

    // Generate tokens
    const accessToken = jwtManager.generateAccessToken(user.id, user.email, 'free');
    const refreshToken = jwtManager.generateRefreshToken(user.id);

    // Save refresh token
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)',
      [user.id, refreshToken]
    );

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    res.status(500).json({ error: 'REGISTRATION_FAILED' });
  }
});

// ✅ LOGIN
router.post('/login', [
  body('email').isEmail(),
  body('password').isLength({ min: 1 }),
], async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await db.query(
      'SELECT id, email, password_hash, full_name FROM users WHERE email = $1',
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    // Check password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    // Generate tokens
    const subscription = await db.query(
      'SELECT tier FROM user_subscriptions WHERE user_id = $1 AND status = $2',
      [user.id, 'active']
    );
    const tier = subscription?.tier || 'free';

    const accessToken = jwtManager.generateAccessToken(user.id, user.email, tier);
    const refreshToken = jwtManager.generateRefreshToken(user.id);

    // Save refresh token
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)',
      [user.id, refreshToken]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        tier,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    res.status(500).json({ error: 'LOGIN_FAILED' });
  }
});

// ✅ REFRESH TOKEN
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'MISSING_REFRESH_TOKEN' });
    }

    // Verify refresh token
    const payload = jwtManager.verifyRefreshToken(refreshToken);

    // Check if stored in DB
    const stored = await db.query(
      'SELECT id FROM refresh_tokens WHERE user_id = $1 AND token = $2',
      [payload.userId, refreshToken]
    );

    if (!stored) {
      return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN' });
    }

    // Get user subscription
    const user = await db.query('SELECT email FROM users WHERE id = $1', [payload.userId]);
    const subscription = await db.query(
      'SELECT tier FROM user_subscriptions WHERE user_id = $1 AND status = $2',
      [payload.userId, 'active']
    );

    const newAccessToken = jwtManager.generateAccessToken(
      payload.userId,
      user.email,
      subscription?.tier || 'free'
    );

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(401).json({ error: 'REFRESH_FAILED' });
  }
});

module.exports = router;
```

---

## ⚡ FAZA 3: PAYMENT SYSTEM (45 minut)

### 3.1 Stripe Setup

```bash
# 1. Utwórz Stripe account na https://stripe.com
# 2. Pobierz API keys z https://dashboard.stripe.com/apikeys
# 3. Dodaj do .env:
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# 4. Utwórz produkty w Stripe:
stripe products create --name "HRL Sync Pro" --active=true
stripe products create --name "HRL Sync Premium" --active=true

# 5. Dodaj ceny:
# Pro: $9.99/month
stripe prices create --product=prod_xxx \
  --currency=usd \
  --unit-amount=999 \
  --recurring='{"interval":"month","usage_type":"licensed"}'

# Premium: $29.99/month
stripe prices create --product=prod_yyy \
  --currency=usd \
  --unit-amount=2999 \
  --recurring='{"interval":"month","usage_type":"licensed"}'
```

### 3.2 routes/billing.js

```javascript
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

// ✅ CREATE SUBSCRIPTION
router.post('/subscribe', async (req, res) => {
  try {
    const { priceId } = req.body;
    const userId = req.user.id;

    // Get or create Stripe customer
    let customer = await db.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );

    if (!customer?.stripe_customer_id) {
      const user = await db.query(
        'SELECT email, full_name FROM users WHERE id = $1',
        [userId]
      );

      const stripeCustomer = await stripe.customers.create({
        email: user.email,
        name: user.full_name,
        metadata: { userId },
      });

      await db.query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [stripeCustomer.id, userId]
      );

      customer = { stripe_customer_id: stripeCustomer.id };
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.stripe_customer_id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    // Get tier from price
    const price = await stripe.prices.retrieve(priceId);
    const tier = price.metadata?.tier || 'pro';

    // Update user subscription in DB
    await db.query(
      `INSERT INTO user_subscriptions (user_id, stripe_subscription_id, tier, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        tier = EXCLUDED.tier,
        status = EXCLUDED.status`,
      [userId, subscription.id, tier, subscription.status]
    );

    res.json({
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    });
  } catch (err) {
    res.status(500).json({ error: 'SUBSCRIPTION_FAILED' });
  }
});

// ✅ GET BILLING INFO
router.get('/info', async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await db.query(
      `SELECT tier, status, renews_at, cancelled_at
       FROM user_subscriptions
       WHERE user_id = $1`,
      [userId]
    );

    const invoices = await db.query(
      `SELECT stripe_invoice_id as id, amount, status, created_at
       FROM payment_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    res.json({
      subscription: subscription || { tier: 'free', status: 'inactive' },
      invoices,
    });
  } catch (err) {
    res.status(500).json({ error: 'BILLING_INFO_FAILED' });
  }
});

// ✅ CANCEL SUBSCRIPTION
router.post('/cancel', async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await db.query(
      'SELECT stripe_subscription_id FROM user_subscriptions WHERE user_id = $1',
      [userId]
    );

    if (!subscription?.stripe_subscription_id) {
      return res.status(404).json({ error: 'NO_SUBSCRIPTION' });
    }

    await stripe.subscriptions.del(subscription.stripe_subscription_id);

    await db.query(
      `UPDATE user_subscriptions
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'CANCEL_FAILED' });
  }
});

module.exports = router;
```

### 3.3 Stripe Webhook Handler

```javascript
// routes/webhooks.js
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

router.post('/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const user = await db.query(
          'SELECT id FROM users WHERE stripe_customer_id = $1',
          [invoice.customer]
        );

        if (user) {
          await db.query(
            `INSERT INTO payment_logs (user_id, stripe_invoice_id, amount, status)
             VALUES ($1, $2, $3, 'success')`,
            [user.id, invoice.id, invoice.amount_paid / 100]
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const user = await db.query(
          'SELECT id FROM users WHERE stripe_customer_id = $1',
          [subscription.customer]
        );

        if (user) {
          await db.query(
            `UPDATE user_subscriptions
             SET status = 'cancelled'
             WHERE user_id = $1`,
            [user.id]
          );
        }
        break;
      }
    }

    res.json({received: true});
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(400).json({error: 'Webhook failed'});
  }
});

module.exports = router;
```

---

## ⚡ FAZA 4: SPOTIFY INTEGRATION (45 minut)

### 4.1 routes/integrations.js

```javascript
const express = require('express');
const { SpotifyIntegration } = require('../integrations/platforms');

const router = express.Router();
const spotify = new SpotifyIntegration();

// ✅ GET AUTH URL
router.get('/spotify/auth-url', async (req, res) => {
  try {
    const authUrl = await spotify.getAuthorizationURL();
    res.json({ authUrl });
  } catch (err) {
    res.status(500).json({ error: 'AUTH_URL_FAILED' });
  }
});

// ✅ HANDLE CALLBACK
router.get('/spotify/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const userId = req.user.id;

    const tokens = await spotify.handleCallback(code);

    // Save to database
    await db.query(
      `INSERT INTO user_oauth_tokens (user_id, provider, access_token, refresh_token, expires_at)
       VALUES ($1, 'spotify', $2, $3, $4)
       ON CONFLICT (user_id, provider) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at`,
      [userId, tokens.accessToken, tokens.refreshToken, new Date(tokens.expiresAt)]
    );

    // Redirect to frontend with success
    res.redirect(`${process.env.FRONTEND_URL}/settings?integration=spotify&success=true`);
  } catch (err) {
    res.redirect(`${process.env.FRONTEND_URL}/settings?integration=spotify&error=${err.message}`);
  }
});

// ✅ SYNC PLAYLISTS
router.post('/spotify/sync', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get stored token
    const token = await db.query(
      'SELECT access_token FROM user_oauth_tokens WHERE user_id = $1 AND provider = $2',
      [userId, 'spotify']
    );

    if (!token?.access_token) {
      return res.status(401).json({ error: 'NOT_CONNECTED' });
    }

    // Sync playlists
    const playlists = await spotify.syncPlaylistsFromSpotify(userId, token.access_token, db);

    res.json({
      synced: playlists.length,
      playlists,
    });
  } catch (err) {
    res.status(500).json({ error: 'SYNC_FAILED' });
  }
});

// ✅ SEARCH SPOTIFY
router.get('/spotify/search', async (req, res) => {
  try {
    const { q } = req.query;
    const results = await spotify.searchTrack(q, 20);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'SEARCH_FAILED' });
  }
});

module.exports = router;
```

---

## ⚡ FAZA 5: FRONTEND (30 minut)

### 5.1 src/hooks/useAuth.ts

```typescript
import { create } from 'zustand';
import { useQuery, useMutation } from 'react-query';

interface User {
  id: string;
  email: string;
  fullName: string;
  tier: 'free' | 'pro' | 'premium' | 'enterprise';
}

export const useAuth = create<{
  user: User | null;
  setUser: (user: User | null) => void;
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
}>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  accessToken: localStorage.getItem('accessToken'),
  setAccessToken: (token) => {
    if (token) localStorage.setItem('accessToken', token);
    else localStorage.removeItem('accessToken');
    set({ accessToken: token });
  },
}));

export const useLogin = () => {
  return useMutation(
    async ({ email, password }: { email: string; password: string }) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) throw new Error('Login failed');
      return response.json();
    },
    {
      onSuccess: (data) => {
        useAuth.setState({
          user: data.user,
          accessToken: data.accessToken,
        });
        localStorage.setItem('refreshToken', data.refreshToken);
      },
    }
  );
};

export const useRegister = () => {
  return useMutation(
    async ({
      email,
      password,
      fullName,
    }: {
      email: string;
      password: string;
      fullName: string;
    }) => {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });

      if (!response.ok) throw new Error('Registration failed');
      return response.json();
    },
    {
      onSuccess: (data) => {
        useAuth.setState({
          user: data.user,
          accessToken: data.accessToken,
        });
        localStorage.setItem('refreshToken', data.refreshToken);
      },
    }
  );
};
```

### 5.2 src/components/SubscriptionManager.tsx

```typescript
import { useQuery, useMutation } from 'react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const SubscriptionManager = () => {
  const { user, accessToken } = useAuth();

  const { data: billing } = useQuery(
    ['billing', user?.id],
    async () => {
      const response = await fetch('/api/billing/info', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      return response.json();
    },
    { enabled: !!user }
  );

  const subscribeMutation = useMutation(
    async (priceId: string) => {
      const response = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ priceId }),
      });
      return response.json();
    }
  );

  const tiers = [
    {
      name: 'Free',
      price: '$0',
      features: ['5 tracks', '1 playlist', 'Web access'],
    },
    {
      name: 'Pro',
      price: '$9.99/mo',
      priceId: 'price_xxx',
      features: ['100 tracks', 'Unlimited playlists', 'Google Drive'],
    },
    {
      name: 'Premium',
      price: '$29.99/mo',
      priceId: 'price_yyy',
      features: ['Unlimited tracks', 'All integrations', 'Collaboration'],
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {tiers.map((tier) => (
        <Card key={tier.name} className="p-6">
          <h3 className="text-xl font-bold">{tier.name}</h3>
          <p className="text-2xl font-bold my-2">{tier.price}</p>

          <ul className="space-y-2 my-4">
            {tier.features.map((feature) => (
              <li key={feature} className="text-sm">
                ✓ {feature}
              </li>
            ))}
          </ul>

          {tier.priceId && (
            <Button
              onClick={() => subscribeMutation.mutate(tier.priceId)}
              disabled={subscribeMutation.isLoading}
              className="w-full"
            >
              {user?.tier === tier.name ? 'Current Plan' : 'Upgrade'}
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
};
```

---

## ⚡ FAZA 6: TESTING (15 minut)

### 6.1 Test Payment Flow

```bash
# 1. Use Stripe test cards
# 4242 4242 4242 4242 - Success
# 4000 0025 0000 3155 - Decline

# 2. Start webhook listener
stripe listen --forward-to localhost:3001/api/webhooks/stripe

# 3. Test flow:
# - Register user
# - Click "Upgrade to Pro"
# - Enter test card number
# - Check /api/billing/info for subscription
```

### 6.2 Test Spotify Integration

```bash
# 1. Visit: /integrations/spotify/auth-url
# 2. Click generated link (Spotify consent)
# 3. Should redirect to callback
# 4. Check database for stored token
# 5. Click "Sync Playlists"
# 6. Verify playlists imported
```

---

## ✅ DEPLOYMENT CHECKLIST

- [ ] All environment variables set
- [ ] Database migrations applied
- [ ] Tests passing (npm test)
- [ ] Staging deployment successful
- [ ] Payment flow tested with real Stripe account
- [ ] Spotify integration verified
- [ ] SSL certificate installed
- [ ] Rate limiting verified
- [ ] Security headers checked
- [ ] Monitoring setup (Sentry, logs)
- [ ] Backup configured
- [ ] Production deployment

---

## 📱 NEXT PHASE

Once core features working:
1. Add Apple Music integration (similar to Spotify)
2. Implement YouTube Music download
3. Add real-time collaboration
4. Deploy PWA features
5. Setup Analytics

---

**Ready to go live!** 🚀

