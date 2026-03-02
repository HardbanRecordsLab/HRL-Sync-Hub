# HRL Sync — Instrukcja Wdrożenia
### Hardban Records Lab · Sync Management Platform

---

## Architektura

```
Vercel (Frontend)          VPS (Backend API)              Google Drive
React + Vite               Node.js + Express              ─────────────
─────────────    ←─────→   PostgreSQL 15 (self-hosted)   Audio files
hrlsync.vercel.app         Port 3001 → Nginx 443         Lyrics (Docs)
                           api.hardbanrecords.com
                                    ↑
                           WordPress Plugin (iframe embed)
                           [hrlsync token="…"]
```

**Kluczowa zasada:** Google Drive = storage plików. VPS przechowuje tylko metadane (PostgreSQL) i proxy-stream audio do przeglądarki. Żadne pliki audio nie są kopiowane na serwer.

---

## 1. Google Cloud — OAuth & Drive API

### 1.1 Nowy projekt
https://console.cloud.google.com → New Project → `hrl-sync`

### 1.2 Włącz API
APIs & Services → Enable APIs:
- Google Drive API
- Google Docs API

### 1.3 OAuth 2.0
Credentials → Create → OAuth 2.0 Client ID → Web app
```
Authorized redirect URIs:
  https://api.hardbanrecords.com/api/auth/google/callback
  http://localhost:3001/api/auth/google/callback
```
Zapisz: `Client ID`, `Client Secret`

### 1.4 Service Account (opcjonalne, dla server-side)
Credentials → Create → Service Account → pobierz JSON
Udostępnij folder Drive temu kontu.

---

## 2. PostgreSQL na VPS

### 2.1 Instalacja (Ubuntu 22.04 / Debian 12)
```bash
apt install postgresql-15 postgresql-contrib-15
systemctl enable --now postgresql
```

### 2.2 Utwórz bazę
```bash
sudo -u postgres psql
```
```sql
CREATE USER hrlsync WITH PASSWORD 'BezpieczneHaslo123';
CREATE DATABASE hrlsync OWNER hrlsync;
GRANT ALL PRIVILEGES ON DATABASE hrlsync TO hrlsync;
\q
```

### 2.3 Załaduj schema
```bash
psql -U hrlsync -d hrlsync -h localhost -f db/schema.sql
```
Wymagane rozszerzenia: `pgcrypto`, `pg_trgm` (instalowane automatycznie przez schema.sql)

### 2.4 Weryfikacja
```bash
psql -U hrlsync -d hrlsync -c "\dt"
# Powinno pokazać ~15 tabel
```

---

## 3. Backend — VPS

### Automatyczna instalacja
```bash
chmod +x setup-vps.sh
sudo ./setup-vps.sh
```
Skrypt instaluje Node.js 20, PM2, PostgreSQL, Nginx, tworzy bazę i startuje API.

### Ręczna instalacja
```bash
cd /var/www/hrlsync-api
npm install --production
cp .env.example .env
nano .env          # ← uzupełnij wartości
pm2 start src/index.js --name hrlsync-api
pm2 save && pm2 startup
```

### Nginx
```bash
cp docs/nginx.conf /etc/nginx/sites-available/hrlsync-api
ln -s /etc/nginx/sites-available/hrlsync-api /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.hardbanrecords.com
```

### .env — wymagane wartości
```bash
DATABASE_URL=postgresql://hrlsync:HASLO@localhost:5432/hrlsync
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
GOOGLE_REDIRECT_URI=https://api.hardbanrecords.com/api/auth/google/callback
FRONTEND_URL=https://hrlsync.vercel.app
# Opcjonalnie (jeśli używasz Supabase tylko do auth):
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## 4. Frontend — Vercel

### 4.1 Deploy
```bash
cd frontend
npm install
vercel login
vercel --prod
```

### 4.2 Zmienne środowiskowe (Vercel Dashboard)
Project → Settings → Environment Variables:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` |
| `VITE_API_URL` | `https://api.hardbanrecords.com` |

### 4.3 vercel.json
Już zawarty w projekcie — obsługuje SPA routing.

---

## 5. WordPress Plugin

### Instalacja
1. Spakuj folder `wordpress-plugin/` jako ZIP: `hrl-sync.zip`
2. WordPress → Plugins → Upload → aktywuj
3. Settings → HRL Sync → wpisz API URL

### Użycie
```
[hrlsync token="TOKEN_Z_PITCHES"]
[hrlsync token="abc123" theme="light" height="600"]
[hrlsync token="abc123" autoplay="true"]
```

Token: HRL Sync app → Pitches → wybierz playlistę → Share Link → skopiuj token z URL.

---

## 6. Przepływ danych — Audio

```
1. Użytkownik łączy Google Drive (/drive)
2. Przegląda pliki → klika "Import to Library"
3. VPS pobiera metadane z Drive (nazwa, rozmiar, MIME)
   → zapisuje w PostgreSQL (tracks.google_drive_file_id)
   → ŻADEN plik nie jest kopiowany
4. W Library użytkownik klika Play
5. Frontend żąda: GET /api/drive/stream/{fileId}
6. VPS:
   a. Weryfikuje JWT (użytkownik jest właścicielem)
   b. Odświeża token Drive jeśli wygasł
   c. Otwiera stream z Google Drive API
   d. Pipe'uje przez siebie do przeglądarki (Range requests!)
7. Audio Player odbiera stream → odtwarza

Dla publicznych playlist (embed):
- Serwer używa Service Account Drive (nie OAuth użytkownika)
- Token embed weryfikowany po stronie serwera
```

---

## 7. Komendy administracyjne

```bash
# Logi
pm2 logs hrlsync-api
tail -f /var/www/hrlsync-api/logs/error.log

# Restart po zmianach
pm2 restart hrlsync-api

# Status
pm2 status
curl https://api.hardbanrecords.com/health

# Backup bazy
pg_dump -U hrlsync hrlsync > backup_$(date +%Y%m%d).sql

# Restore
psql -U hrlsync hrlsync < backup_20241201.sql

# Monitoring PM2
pm2 monit
```

---

## 8. Struktura projektu

```
hrlsync/
├── frontend/                    → Vercel
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    HRL Sync branded
│   │   │   ├── Library.tsx      Drive-sourced tracks + player
│   │   │   ├── LyricsCatalog.tsx  Lyrics + Google Doc sync
│   │   │   ├── GoogleDrive.tsx  Browse/import/stream
│   │   │   └── … (Pitches, Contacts, Projects, Analytics)
│   │   ├── components/
│   │   │   └── player/
│   │   │       └── AudioPlayerBar.tsx  Fixed bottom player
│   │   └── hooks/
│   │       └── useAudioPlayer.ts  Global audio state
│   └── vercel.json
│
├── backend/                     → VPS
│   ├── src/
│   │   ├── routes/
│   │   │   ├── drive.js     Stream proxy + import
│   │   │   ├── lyrics.js    CRUD + Drive doc sync
│   │   │   ├── tracks.js    PostgreSQL tracks
│   │   │   ├── embed.js     Public player HTML
│   │   │   └── …
│   │   ├── services/
│   │   │   └── googleDrive.js  Drive service + range streaming
│   │   ├── db/
│   │   │   └── pool.js      pg Pool
│   │   └── middleware/
│   │       └── auth.js      JWT + optional Supabase
│   └── .env.example
│
├── db/
│   └── schema.sql             → psql hrlsync < schema.sql
│
├── wordpress-plugin/            → Upload jako ZIP
│   ├── hrl-sync.php
│   └── assets/
│       ├── block.js  (Gutenberg)
│       └── embed.css
│
├── docs/
│   ├── nginx.conf
│   └── DEPLOYMENT.md
│
└── setup-vps.sh                → sudo bash setup-vps.sh
```
