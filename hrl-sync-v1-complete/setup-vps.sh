#!/bin/bash
# ════════════════════════════════════════════════════════════════
#  HRL Sync — VPS Setup Script
#  Installs: Node.js 20, PostgreSQL 15, Nginx, Certbot, PM2
#  Usage: sudo bash setup-vps.sh
# ════════════════════════════════════════════════════════════════
set -e
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; NC='\033[0m'

[[ $EUID -ne 0 ]] && echo -e "${RED}Run as root: sudo bash setup-vps.sh${NC}" && exit 1

APP_DIR=/var/www/hrlsync-api
DB_NAME=hrlsync
DB_USER=hrlsync
DB_PASS=$(openssl rand -base64 16 | tr -d '=/+' | cut -c1-20)

echo -e "${YLW}━━━ 1. System update ━━━${NC}"
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq curl git build-essential

echo -e "${YLW}━━━ 2. Node.js 20 ━━━${NC}"
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y -qq nodejs
fi
echo "Node: $(node -v) | npm: $(npm -v)"

echo -e "${YLW}━━━ 3. PM2 ━━━${NC}"
npm install -g pm2 -q

echo -e "${YLW}━━━ 4. PostgreSQL 15 ━━━${NC}"
if ! command -v psql &>/dev/null; then
  apt-get install -y -qq postgresql-15 postgresql-contrib-15
fi
systemctl enable --now postgresql

# Create DB + user
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null || true

# Run schema
sudo -u postgres psql -d ${DB_NAME} -f ${APP_DIR}/../../db/schema.sql 2>/dev/null || true

echo -e "${GRN}✅ PostgreSQL ready: postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}${NC}"

echo -e "${YLW}━━━ 5. Nginx ━━━${NC}"
apt-get install -y -qq nginx certbot python3-certbot-nginx

echo -e "${YLW}━━━ 6. App directory ━━━${NC}"
mkdir -p ${APP_DIR}/logs

# If running from project root, copy backend
if [ -d "./backend" ]; then
  cp -r backend/* ${APP_DIR}/
fi

cd ${APP_DIR}
npm install --production

# Create .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  # Auto-fill DB password
  sed -i "s|postgresql://hrlsync:yourpassword@localhost:5432/hrlsync|postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}|g" .env
fi

echo -e "${YLW}━━━ 7. PM2 start ━━━${NC}"
pm2 delete hrlsync-api 2>/dev/null || true
pm2 start src/index.js --name hrlsync-api --max-memory-restart 512M
pm2 save
eval "$(pm2 startup | tail -1)" || true

echo ""
echo -e "${GRN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GRN}║  HRL Sync API is running!                       ║${NC}"
echo -e "${GRN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "📦 DB:  ${YLW}postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}${NC}"
echo -e "🌐 API: http://localhost:3001"
echo ""
echo -e "${YLW}Next steps:${NC}"
echo "1. Edit /var/www/hrlsync-api/.env — add Google OAuth, Supabase keys"
echo "2. Configure Nginx: see DEPLOYMENT.md section 3"
echo "3. Get SSL: certbot --nginx -d api.yourdomain.com"
echo "4. Restart: pm2 restart hrlsync-api"
echo ""
echo -e "Logs: ${YLW}pm2 logs hrlsync-api${NC}"
echo -e "Health: ${YLW}curl http://localhost:3001/health${NC}"
