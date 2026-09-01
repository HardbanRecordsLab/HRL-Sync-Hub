# HRL Sync — Wdrożenie

```
Vercel (frontend)                 VPS / Docker (API + Postgres)         Google Drive
React + Vite                      Node 20 + Express                     ────────────
app.hrl-sync-hub…      ──HTTPS──▶ PostgreSQL 16                         pliki audio
                                  sync-api.hardbanrecordslab.online     Google Docs (teksty)
                                          ▲
                                  WordPress plugin  [hrlsync token="…"]
```

**Zasada:** Google Drive = magazyn plików audio. API trzyma tylko metadane (Postgres)
i proxy-streamuje audio do przeglądarki. Żaden plik audio nie jest kopiowany na serwer.

Auth: własny JWT (email + hasło). Konta zakłada administrator — brak publicznej rejestracji.

---

## 1. Google Cloud (opcjonalne, ale potrzebne do Drive/Docs)

1. Nowy projekt → **APIs & Services → Enable**: `Google Drive API`, `Google Docs API`
2. **Credentials → OAuth 2.0 Client ID → Web application**
   Authorized redirect URIs:
   ```
   https://sync-api.hardbanrecordslab.online/api/auth/google/callback
   http://localhost:3001/api/auth/google/callback
   ```
3. Zapisz `Client ID` + `Client Secret` → do `backend/.env`
4. (Opcjonalnie) Service Account → JSON w jednej linii → `GOOGLE_SERVICE_ACCOUNT_JSON`
   (potrzebne tylko do publicznego odtwarzania w embed playerze)

---

## 2. Backend — Docker (zalecane)

Wymaga tylko Dockera na VPS.

```bash
git clone <repo> /srv/hrl-sync && cd /srv/hrl-sync
cp backend/.env.example backend/.env
nano backend/.env         # ↓ patrz "Wymagane zmienne"
docker compose up -d --build
docker compose exec api npm run db:seed   # tworzy konto admina (ADMIN_EMAIL / ADMIN_PASSWORD)
curl localhost:3001/health                # {"status":"ok","db":"connected"}
```

Schemat bazy stosuje się **automatycznie przy każdym starcie** (`src/db/schema.sql`,
idempotentny). Nie trzeba nic ładować ręcznie.

### Wymagane zmienne (`backend/.env`)

```bash
JWT_SECRET=            # openssl rand -base64 48   ← OBOWIĄZKOWE
ADMIN_EMAIL=you@label.com
ADMIN_PASSWORD=        # min. 8 znaków, użyte tylko przez `npm run db:seed`
FRONTEND_URL=https://app.hrl-sync-hub.hardbanrecordslab.online
ALLOWED_ORIGINS=https://app.hrl-sync-hub.hardbanrecordslab.online
API_URL=https://sync-api.hardbanrecordslab.online
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://sync-api.hardbanrecordslab.online/api/auth/google/callback
# opcjonalne: GROQ_API_KEY, GEMINI_API_KEY (AI), SMTP_* (maile)
```

`DATABASE_URL`, `PORT`, `NODE_ENV` ustawia `docker-compose.yml` — nie ruszaj ich w `.env`.
Hasło Postgresa: `POSTGRES_PASSWORD` w root `.env` lub shellu (domyślnie `hrlsync_dev`,
baza nie jest wystawiona na host).

### Nginx + TLS przed kontenerem

```bash
cp docs/nginx.conf /etc/nginx/sites-available/hrlsync-api
ln -s /etc/nginx/sites-available/hrlsync-api /etc/nginx/sites-enabled/
certbot --nginx -d sync-api.hardbanrecordslab.online
nginx -t && systemctl reload nginx
```

---

## 3. Frontend — Vercel

1. Nowy projekt → **Root Directory: `frontend`**
2. Framework: Vite (autodetekcja). Build: `npm run build`, Output: `dist`
3. W `frontend/vercel.json` podmień `REPLACE-WITH-YOUR-API-HOST` na host API
   (np. `sync-api.hardbanrecordslab.online`). Wtedy front woła API przez `/api/*`
   z tej samej domeny i `VITE_API_URL` może zostać puste.
   Alternatywnie ustaw `VITE_API_URL` w zmiennych środowiskowych Vercela.

---

## 4. CI/CD (GitHub Actions)

`.github/workflows/deploy.yml` — przy pushu do `main` (zmiany w `backend/**`):
1. uruchamia `npm run test:e2e` (test in-memory, bez usług zewnętrznych)
2. SSH na VPS → `git pull` → `docker compose up -d --build`

Sekrety repo: `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_SSH_KEY`, `DEPLOY_DIR`.

---

## 5. WordPress plugin (embed)

1. Spakuj `wordpress-plugin/` → ZIP → Plugins → Upload → aktywuj
2. Settings → HRL Sync → wpisz API URL
3. `[hrlsync token="TOKEN"]` — token z: HRL Sync → Pitches → Share → skopiuj z URL-a

---

## 6. Przepływ audio

```
1. /drive → Connect Google Drive (OAuth, callback: /api/auth/google/callback)
2. Przeglądasz pliki → Import to Library  (zapisuje tylko metadane + Drive file ID)
3. Library → Play → GET /api/tracks/stream/{trackId}?token=JWT
4. API weryfikuje JWT/ownership → odświeża token Drive jeśli trzeba →
   pipe'uje stream z Drive do przeglądarki (obsługa Range = seek)
5. Playlisty (Pitches) → Share link → publiczne /share/{token}
   odtwarzanie: /api/tracks/stream/{trackId}?shareToken={token}
```

---

## 7. Operacje

```bash
docker compose logs -f api
docker compose exec api npm run db:seed          # reset hasła admina
docker compose exec db pg_dump -U hrlsync hrlsync > backup_$(date +%F).sql
docker compose restart api
```
