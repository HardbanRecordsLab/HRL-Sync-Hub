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
```

**Magazyn audio:** MinIO (S3-compatible) w kontenerze na VPS. API jest jedyną bramką —
proxy-streamuje bajty przez `/api/tracks/stream/:id` (Range/seek), nigdy nie wystawia
obiektów publicznie. `STORAGE_DRIVER=fs` przełącza na lokalny katalog (tylko dev).

**Auth:** własny JWT (email + hasło). Konta zakłada administrator — brak publicznej rejestracji.

---

## 1. AI — auto-tagowanie (opcjonalne, OpenRouter)

1. `console.openrouter.ai` → API key
2. Do `.env` na VPS: `OPENROUTER_API_KEY=sk-or-...` → `docker compose up -d`
3. (opcjonalnie) `AI_MODELS=` — lista modeli po przecinku, próbowane po kolei
   (darmowe `:free` najpierw, jeden tani płatny na końcu). Puste = wbudowany default.

Bez klucza przycisk „AI Insight" na stronie utworu zwraca 503 — tagujesz ręcznie.

---

## 2. Backend — Docker (zalecane)

Wymaga tylko Dockera. Stack: API + MinIO (+ opcjonalnie własny Postgres).

```bash
git clone git@github.com:HardbanRecordsLab/HRL-Sync-Hub.git /srv/hrl-sync
cd /srv/hrl-sync
cp .env.example .env
nano .env                 # ↓ patrz "Wymagane zmienne"
echo 'API_PORT=9110' >> .env
```

**Wariant A — wbudowany Postgres** (świeży serwer, zero zależności):

```bash
docker compose --profile localdb up -d --build
```

**Wariant B — współdzielony Postgres** (jak na produkcji HRL — jeden PG na cały VPS,
objęty istniejącym backupem serwera). W `.env`:

```bash
DATABASE_URL=postgres://USER:PASS@HOST:5432/hrl_sync
```

i `docker-compose.override.yml` (nie idzie do git) podpinający kontener API do sieci tej bazy:

```yaml
services:
  api:
    networks: [default, shared-db]
networks:
  shared-db:
    external: true
    name: <nazwa-sieci-dockera-bazy>
```

potem: `docker compose up -d --build`

```bash
docker compose exec api npm run db:seed   # konto admina (ADMIN_EMAIL / ADMIN_PASSWORD)
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
OPENROUTER_API_KEY=sk-or-...  # opcjonalne — AI auto-tagowanie
# opcjonalne: SMTP_* (maile), SENTRY_DSN
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
```

---

## 7. Operacje

```bash
docker compose logs -f api                     # logi (też w wolumenie hrl_logs)
docker compose exec api npm run db:seed        # reset hasła admina
docker compose restart api
```

MinIO console: odkomentuj `ports: 127.0.0.1:9001:9001` w compose → `http://127.0.0.1:9001`
(login = `S3_ACCESS_KEY` / `S3_SECRET_KEY`).

### Backup

`scripts/backup.sh` — codzienny zrzut: MinIO (wolumen → `.tar.gz`) + wbudowany
Postgres (jeśli używany; przy współdzielonym PG bazę backupuje serwer bazy).

```bash
crontab -e
# 30 3 * * *  /srv/hrl-sync/scripts/backup.sh >> /var/log/hrl-sync-backup.log 2>&1
```

Domyślnie do `/srv/backups/hrl-sync/`, retencja 14 dni. Restore — instrukcje w nagłówku skryptu.

### Monitoring

- Auto-restart: `restart: unless-stopped` + healthcheck kontenera.
- Błędy aplikacji: ustaw `SENTRY_DSN` w `.env` → `docker compose up -d`.
- Uptime: dodaj monitor HTTP w Uptime Kuma na `https://hrl-sync.hardbanrecordslab.online/health`.
