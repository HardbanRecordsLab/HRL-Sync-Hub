# HRL Sync

Prywatna biblioteka sync-licensingowa Hardban Records Lab: katalog utworów z Google
Drive jako magazynem audio, współdzielony odtwarzacz strumieniowy, playlisty
pitchowe z linkami do klientów, katalog tekstów (sync z Google Docs), CRM
kontaktów, kanban projektów i analityka odsłuchań.

```
frontend/   React + Vite + Tailwind  → Vercel
backend/    Node 20 + Express + PostgreSQL 16  → Docker / VPS
wordpress-plugin/   shortcode [hrlsync] do osadzania playera
docs/DEPLOYMENT.md   pełna instrukcja wdrożenia
```

## Szybki start (lokalnie)

Wymagania: Node 20+, Docker (dla bazy) **lub** lokalny PostgreSQL.

```bash
# 1. Baza + API
cd backend
cp .env.example .env            # ustaw JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
docker run -d --name hrl-pg -e POSTGRES_USER=hrlsync -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=hrlsync -p 5432:5432 postgres:16-alpine
# DATABASE_URL=postgres://hrlsync:dev@localhost:5432/hrlsync  w .env
npm run dev                     # applikuje schemat, startuje na :3001
npm run db:seed                 # tworzy konto admina

# 2. Frontend
cd ../frontend
cp .env.example .env.local      # VITE_API_URL=http://localhost:3001
npm install
npm run dev                     # http://localhost:8080
```

Logujesz się mailem/hasłem admina. Konta użytkowników dodajesz jako admin
(`POST /api/auth/register`).

## Testy

```bash
cd backend && npm run test:e2e      # E2E na in-memory Postgres (pg-mem), bez usług zewn.
cd frontend && npm run build         # typecheck + build
```

## Pełne wdrożenie

Zobacz **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Docker Compose (API + Postgres),
Vercel (frontend), Nginx/TLS, GitHub Actions, Google OAuth, WordPress plugin.

## Stan / roadmap

`docs/update_app_docs/` zawiera analizy i pomysły na rozwój (waveform, wyszukiwarka
fasetowa, zarządzanie prawami/splitami, umowy licencyjne, białe etykiety, integracje
Spotify/Discogs). Rdzeń (katalog + player + pitche + share + analityka + Drive/Docs
sync) działa end-to-end.
