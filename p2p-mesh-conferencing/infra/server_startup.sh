#!/bin/bash
set -e
exec > /var/log/server-startup.log 2>&1

# ── Terraform-injected values ─────────────────────────────────────────────────
PUBLIC_IP="${public_ip}"
DOMAIN="${domain}"
PG_PASSWORD="${postgres_password}"
JWT_SA="${jwt_super_admin_secret}"
JWT_ADMIN="${jwt_admin_secret}"
JWT_USER="${jwt_user_secret}"

echo "=== [1/9] Server setup starting — IP: $PUBLIC_IP, Domain: $DOMAIN ==="

# ── Node.js 20 + system tools ─────────────────────────────────────────────────
echo "=== [2/9] Installing Node.js, git, nginx, docker, certbot ==="
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs git nginx docker certbot python3-certbot-nginx

# ── Docker + PostgreSQL container ─────────────────────────────────────────────
echo "=== [3/9] Starting PostgreSQL in Docker ==="
systemctl enable docker
systemctl start docker

docker run -d \
  --name postgres \
  --restart always \
  -e POSTGRES_USER=meshuser \
  -e POSTGRES_PASSWORD=$PG_PASSWORD \
  -e POSTGRES_DB=meshdb \
  -p 127.0.0.1:5432:5432 \
  postgres:15

echo "Waiting for Postgres to be ready..."
for i in $(seq 1 30); do
  if docker exec postgres pg_isready -U meshuser -d meshdb > /dev/null 2>&1; then
    echo "Postgres is ready."
    break
  fi
  echo "  attempt $i/30..."
  sleep 2
done

# ── Clone repo ────────────────────────────────────────────────────────────────
echo "=== [4/9] Cloning repository ==="
git clone https://github.com/yusuf-9/p2p-mesh-conference.git /app

# ── Server build ──────────────────────────────────────────────────────────────
echo "=== [5/9] Building server ==="
cd /app/p2p-mesh-conferencing/server

cat > .env << ENVEOF
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=meshdb
POSTGRES_USER=meshuser
POSTGRES_PASSWORD=$PG_PASSWORD
JWT_SUPER_ADMIN_SECRET=$JWT_SA
JWT_ADMIN_SECRET=$JWT_ADMIN
JWT_USER_SECRET=$JWT_USER
JWT_EXPIRES_IN=24h
SERVER_PORT=3000
NODE_ENV=production
CORS_ORIGIN=*
API_BASE_URL=https://$DOMAIN
ENVEOF

npm install
npm run db:migrate
npm run build

# ── Systemd service ───────────────────────────────────────────────────────────
cat > /etc/systemd/system/mesh-server.service << 'SVCEOF'
[Unit]
Description=P2P Mesh Conference Server
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/app/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
EnvironmentFile=/app/server/.env

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl enable mesh-server
systemctl start mesh-server

# ── Nginx — HTTP only first so certbot can verify the domain ──────────────────
echo "=== [6/9] Configuring nginx (HTTP) ==="

cat > /etc/nginx/conf.d/mesh.conf << NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;
    root /usr/share/nginx/html;

    location = / { return 301 /client/; }
    location /client/ { try_files \$uri \$uri/ /client/index.html; }
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400;
    }
}
NGINXEOF

rm -f /etc/nginx/conf.d/default.conf
systemctl enable nginx
systemctl start nginx

# ── Let's Encrypt certificate ─────────────────────────────────────────────────
echo "=== [7/9] Obtaining SSL certificate ==="
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --register-unsafely-without-email

# ── Client build (with HTTPS URLs) ───────────────────────────────────────────
echo "=== [8/9] Building client ==="
cd /app/p2p-mesh-conferencing/client

cat > .env.production << ENVEOF
VITE_WS_URL=https://$DOMAIN
VITE_API_URL=https://$DOMAIN/api
ENVEOF

npm install
npm run build

mkdir -p /usr/share/nginx/html/client
cp -r dist/* /usr/share/nginx/html/client/

systemctl reload nginx

echo "=== [9/10] Done. App live at https://$DOMAIN/client/ ==="

# ── Seed: create admin + API key ──────────────────────────────────────────────
echo "=== [10/10] Seeding admin user and API key ==="

echo "Waiting for server to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "Server is ready."
    break
  fi
  echo "  attempt $i/30..."
  sleep 3
done

echo "Generating super-admin token..."
SUPER_ADMIN_TOKEN=$(cd /app/p2p-mesh-conferencing/server/scripts && node create-super-admin-token.js | sed -n '2p' | xargs)

ADMIN_EMAIL="admin@loadtest.local"
ADMIN_PASSWORD=$(openssl rand -hex 16)

echo "Creating admin user ($ADMIN_EMAIL)..."
curl -sf -X POST http://localhost:3000/api/super-admin/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"

echo "Logging in as admin..."
LOGIN_RESPONSE=$(curl -sf -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
ADMIN_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

echo "Creating API key..."
API_KEY_RESPONSE=$(curl -sf -X POST http://localhost:3000/api/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"loadtest"}')
API_KEY=$(echo "$API_KEY_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['apiKey']['value'])")

echo ""
echo "========================================"
echo "  SERVER READY"
echo "========================================"
echo "  Public IP   : $PUBLIC_IP"
echo "  Domain      : https://$DOMAIN"
echo "  Admin email : $ADMIN_EMAIL"
echo "  Admin pass  : $ADMIN_PASSWORD"
echo "  API key     : $API_KEY"
echo "========================================"
