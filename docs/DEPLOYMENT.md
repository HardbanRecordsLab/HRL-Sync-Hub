# HRL Sync — Wdrożenie

```text
Vercel (frontend)                              VPS / Docker
React + Vite                        ┌─────────────────────────────────────┐
hrl-sync.hub.hardbanrecordslab…     │  API (Node 20 + Express) :9110       │
        │   ───/api/* (rewrite)────▶ │    hrl-sync.hardbanrecordslab.online │
        │                            │  PostgreSQL 16   (kontener, wewn.)   │
        │                            │  MinIO           (kontener, wewn.)   │  ← magazyn audio
        │                            └─────────────────────────────────────┘
        │                                         ▲
        │                            WordPress plugin  [hrlsync token="…"]   (opcjonalnie)
        │                            Google Drive / Docs                     (opcjonalny import)
```

**Magazyn audio:** MinIO (S3-compatible) w kontenerze na VPS. API jest jedyną bramką —
proxy-streamuje bajty przez `/api/tracks/stream/:id` (Range/seek), nigdy nie wystawia
obiektów publicznie. `STORAGE_DRIVER=fs` przełącza na lokalny katalog (tylko dev).
Google Drive jest opcjonalnym źródłem importu.

**Auth:** własny JWT (email + hasło). Konta zakłada administrator — brak publicznej rejestracji.

---

## 1. Google Cloud (opcjonalne, ale potrzebne do Drive/Docs)

1. Nowy projekt → **APIs & Services → Enable**: `Google Drive API`, `Google Docs API`
2. **Credentials → OAuth 2.0 Client ID → Web application**
   Authorized redirect URIs:
   ```text
   https://hrl-sync.hardbanrecordslab.online/api/auth/google/callback
   http://localhost:3001/api/auth/google/callback
   ```
3. Zapisz `Client ID` + `Client Secret` → do `.env` na VPS (`/srv/hrl-sync/.env`) →
   `docker compose restart api`
4. (Opcjonalnie) Service Account → JSON w jednej linii → `GOOGLE_SERVICE_ACCOUNT_JSON`
   (potrzebne tylko do publicznego odtwarzania w embed playerze)

---

## 2. Backend — Docker (zalecane)

Wymaga tylko Dockera na VPS. Stack: API + PostgreSQL + MinIO.

```bash
git clone git@github.com:HardbanRecordsLab/HRL-Sync-Hub.git /srv/hrl-sync
cd /srv/hrl-sync
cp .env.example .env
nano .env                 # ↓ patrz "Wymagane zmienne"
echo 'API_PORT=9110' >> .env
docker compose up -d --build
docker compose exec api npm run db:seed   # tworzy konto admina (ADMIN_EMAIL / ADMIN_PASSWORD)
curl localhost:9110/health                # {"status":"ok","db":"connected"}
```

Schemat bazy stosuje się **automatycznie przy każdym starcie** (`backend/src/db/schema.sql`,
idempotentny). Bucket MinIO (`hrl-audio`) tworzy się automatycznie.

### Wymagane zmienne (root `.env`)

```bash
JWT_SECRET=            # openssl rand -base64 48   ← OBOWIĄZKOWE
ADMIN_EMAIL=hardbanrecordslab.pl@gmail.com
ADMIN_PASSWORD=        # min. 8 znaków, użyte tylko przez `npm run db:seed`
POSTGRES_PASSWORD=     # dowolne mocne
S3_ACCESS_KEY=hrl-minio
S3_SECRET_KEY=         # min. 8 znaków — root MinIO
API_PORT=9110
API_URL=https://hrl-sync.hardbanrecordslab.online
FRONTEND_URL=https://hrl-sync.hub.hardbanrecordslab.online
ALLOWED_ORIGINS=https://hrl-sync.hub.hardbanrecordslab.online
GOOGLE_CLIENT_ID=...          # opcjonalne (import z Drive + teksty z Docs)
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://hrl-sync.hardbanrecordslab.online/api/auth/google/callback
# opcjonalne: GROQ_API_KEY, GEMINI_API_KEY (AI-tagi), SMTP_* (maile)
```

`DATABASE_URL`, `STORAGE_DRIVER`, `S3_ENDPOINT`, `PORT`, `NODE_ENV` ustawia `docker-compose.yml`
(sieć wewnętrzna) — nie dodawaj ich do `.env`. Postgres i MinIO **nie są wystawione na host**.

### Nginx + TLS przed kontenerem

```bash
sed -i 's/sync-api.hardbanrecordslab.online/hrl-sync.hardbanrecordslab.online/g; s#127.0.0.1:3001#127.0.0.1:9110#g' docs/nginx.conf
cp docs/nginx.conf /etc/nginx/sites-available/hrl-sync
ln -s /etc/nginx/sites-available/hrl-sync /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d hrl-sync.hardbanrecordslab.online
```

---

## 3. Frontend — Vercel

1. Nowy projekt → import repo → **Root Directory: `frontend`** (Vite, autodetekcja)
2. `frontend/vercel.json` już kieruje `/api/*` → `hrl-sync.hardbanrecordslab.online`
   i robi SPA-fallback. `VITE_API_URL` zostaw puste (front woła API same-origin przez rewrite).
3. Settings → Domains → dodaj `hrl-sync.hub.hardbanrecordslab.online` → dodaj wskazany
   rekord CNAME w Cloudflare (**szara chmurka** — Vercel obsługuje własny SSL).
4. Backend musi mieć `FRONTEND_URL` i `ALLOWED_ORIGINS` = `https://hrl-sync.hub.hardbanrecordslab.online`.

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
1. Library → Upload audio  → POST /api/tracks/upload (multipart, tylko admin)
   → plik staging → MinIO (bucket hrl-audio) → wiersz w tracks (source='local')
2. Library → Play → GET /api/tracks/stream/{trackId}?token=JWT
   → API weryfikuje JWT/ownership → GetObject z MinIO (Range = seek) → przeglądarka
3. Playlisty (Pitches) → Share link → publiczne /share/{token}
   odtwarzanie: /api/tracks/stream/{trackId}?shareToken={token}
4. (opcjonalnie) /drive → Connect Google Drive → Import → tracks (source='google_drive')
   stream: API proxy-uje z Drive kontem właściciela
```

---

## 7. Operacje

```bash
docker compose logs -f api
docker compose exec api npm run db:seed                       # reset hasła admina
docker compose exec db pg_dump -U hrlsync hrlsync > db_$(date +%F).sql
docker compose exec minio mc mirror --overwrite local/hrl-audio /data-backup   # backup audio
docker compose restart api
```

MinIO console: odkomentuj `ports: 127.0.0.1:9001:9001` w `docker-compose.yml`,
potem `http://127.0.0.1:9001` (login = `S3_ACCESS_KEY` / `S3_SECRET_KEY`).
