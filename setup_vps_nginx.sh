#!/bin/bash

# Skrypt do automatycznej konfiguracji Nginx jako reverse proxy z certyfikatem SSL
# dla aplikacji HRL Sync Hub.

# PRZERWIJ DZIAŁANIE W RAZIE BŁĘDU
set -e

# --- ZMIENNE KONFIGURACYJNE ---
DOMAIN="sync-api.hardbanrecordslab.online"
# WAŻNE: Podaj swój adres email, aby otrzymywać powiadomienia o odnowieniu certyfikatu.
EMAIL="sync@hardbanrecordslab.online"
NGINX_CONFIG_PATH="/etc/nginx/sites-available/sync-api"

# --- POCZĄTEK SKRYPTU ---
echo "--- Rozpoczynam konfigurację serwera dla HRL Sync Hub ---"

# 1. Aktualizacja systemu i instalacja Nginx
echo "--- Instaluję Nginx... ---"
sudo apt-get update
sudo apt-get install -y nginx

# 2. Instalacja Certbota (do certyfikatów SSL)
echo "--- Instaluję Certbot... ---"
sudo apt-get install -y certbot python3-certbot-nginx

# 3. Tworzenie pliku konfiguracyjnego Nginx
echo "--- Tworzę konfigurację Nginx dla domeny $DOMAIN... ---"
cat <<EOF | sudo tee $NGINX_CONFIG_PATH
# Przekierowanie z HTTP na HTTPS
server {
    listen 80;
    server_name $DOMAIN;

    # Lokalizacja dla odnawiania certyfikatu przez Certbota
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# Konfiguracja serwera HTTPS
server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # Ścieżki do certyfikatów zostaną dodane automatycznie przez Certbota

    # Nagłówki bezpieczeństwa
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "ALLOWALL" always; # Zezwolenie na osadzanie (np. w playerach)

    # Ustawienia dla dużych plików (upload audio)
    client_max_body_size 100M;
    client_body_timeout 300s;

    # Przekierowanie ruchu do aplikacji Node.js działającej na porcie 3001
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off; # Ważne dla streamingu audio
    }
}
EOF

# 4. Aktywacja nowej konfiguracji
echo "--- Aktywuję konfigurację Nginx... ---"
if [ -L /etc/nginx/sites-enabled/sync-api ]; then
    echo "Link symboliczny już istnieje, pomijam."
else
    sudo ln -s $NGINX_CONFIG_PATH /etc/nginx/sites-enabled/
fi

# 5. Test konfiguracji Nginx
echo "--- Testuję poprawność konfiguracji Nginx... ---"
sudo nginx -t

# 6. Restart Nginx przed uruchomieniem Certbota
echo "--- Restartuję Nginx... ---"
sudo systemctl restart nginx

# 7. Pobranie i instalacja certyfikatu SSL
echo "--- Pobieram certyfikat SSL dla domeny $DOMAIN... ---"
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email $EMAIL --redirect

# 8. Finalny restart Nginx
echo "--- Finalny restart Nginx w celu załadowania certyfikatu... ---"
sudo systemctl restart nginx

echo "--- ✅ Konfiguracja serwera zakończona pomyślnie! ---"
echo "Backend powinien być teraz dostępny pod adresem https://$DOMAIN"
