# HRL Sync

Prywatna biblioteka sync-licensingowa Hardban Records Lab: katalog utworów na własnym
magazynie obiektowym (MinIO/S3), współdzielony odtwarzacz strumieniowy, playlisty
pitchowe z linkami do klientów, katalog tekstów (opcjonalny sync z Google Docs),
CRM kontaktów, kanban projektów i analityka odsłuchań.

```
frontend/            React + Vite + Tailwind        → Vercel
backend/             Node 20 + Express + PostgreSQL → Docker / VPS
docker-compose.yml   API + PostgreSQL 16 + MinIO
wordpress-plugin/    shortcode [hrlsync] do osadzania playera
docs/DEPLOYMENT.md   pełna instrukcja wdrożenia
```

## Szybki start — Docker (najprościej)

```bash
cp .env.example .env          # ustaw JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, S3_SECRET_KEY, POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec api npm run db:seed
curl localhost:3001/health    # {"status":"ok","db":"connected"}

cd frontend
echo "VITE_API_URL=http://localhost:3001" > .env.local
npm install && npm run dev    # http://localhost:8080
```

Logujesz się mailem/hasłem admina. Konta użytkowników dodaje admin (`POST /api/auth/register`).

## Szybki start — bez Dockera

Wymaga lokalnego PostgreSQL. Magazyn audio → katalog lokalny (`STORAGE_DRIVER=fs`).

```bash
cd backend && cp .env.example backend/.env   # DATABASE_URL, JWT_SECRET, ADMIN_*
npm install && npm run dev && npm run db:seed
cd ../frontend && echo "VITE_API_URL=http://localhost:3001" > .env.local
npm install && npm run dev
```

## Testy

```bash
cd backend && npm run test:e2e      # 23 checki E2E na in-memory Postgres (pg-mem) + fs-storage
cd frontend && npm run build         # typecheck + build
```

## Wdrożenie produkcyjne — LIVE

| | |
|---|---|
| Backend API | `https://hrl-sync.hardbanrecordslab.online` (VPS · Docker · Let's Encrypt) |
| Frontend | `https://hrl-sync.hub.hardbanrecordslab.online` (Vercel) |
| Magazyn audio | MinIO (kontener, wewn.) · bucket `hrl-audio` |

**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Docker Compose, Vercel, Nginx/TLS,
GitHub Actions, Google OAuth, WordPress plugin.

## Roadmap

`docs/update_app_docs/` — analizy i pomysły (waveform, wyszukiwarka fasetowa,
zarządzanie prawami/splitami, umowy licencyjne, białe etykiety, integracje
Spotify/Discogs). Rdzeń (katalog + upload na MinIO + player + pitche + share +
analityka + opcjonalny Drive/Docs) działa end-to-end.
