#!/bin/bash
set -e
exec > /var/log/server-startup.log 2>&1

# ── Terraform-injected values ─────────────────────────────────────────────────
PUBLIC_IP="${public_ip}"
DOMAIN="${domain}"
REPO_URL="${repo_url}"
PG_PASSWORD="${postgres_password}"
JWT_SA="${jwt_super_admin_secret}"
JWT_USER="${jwt_user_secret}"

echo "=== [1/10] Server setup starting — IP: $PUBLIC_IP, Domain: $DOMAIN ==="

# ── Node.js 20 + system tools ─────────────────────────────────────────────────
echo "=== [2/10] Installing Node.js, git, nginx, docker, certbot ==="
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs git nginx docker certbot python3-certbot-nginx

# ── Docker + PostgreSQL container ─────────────────────────────────────────────
echo "=== [3/10] Starting PostgreSQL in Docker ==="
systemctl enable docker
systemctl start docker

docker run -d \
  --name postgres \
  --restart always \
  -e POSTGRES_USER=sfuuser \
  -e POSTGRES_PASSWORD=$PG_PASSWORD \
  -e POSTGRES_DB=sfudb \
  -p 127.0.0.1:5432:5432 \
  postgres:15

echo "Waiting for Postgres to be ready..."
for i in $(seq 1 30); do
  if docker exec postgres pg_isready -U sfuuser -d sfudb > /dev/null 2>&1; then
    echo "Postgres is ready."
    break
  fi
  echo "  attempt $i/30..."
  sleep 2
done

# ── Clone repo ────────────────────────────────────────────────────────────────
echo "=== [4/10] Cloning repository ==="
git clone $REPO_URL /app

# ── Janus Gateway ─────────────────────────────────────────────────────────────
echo "=== [5/10] Starting Janus Gateway in Docker ==="

# Write janus config with the correct public IP for NAT mapping
cat > /app/janus-sfu-conferencing/janus/janus.jcfg << JANUSEOF
general: {
  nat_1_1_mapping = "$PUBLIC_IP";
  keep_private_host = false;
};

media: {
  rtp_port_range = "10000-60000";
};

nat: {
  stun_server = "stun.l.google.com";
  stun_port = 19302;
  nice_debug = false;
  ice_lite = false;
  ice_tcp = false;
};
JANUSEOF

echo "Write Janus config with the correct public IP for NAT mapping"

# Run Janus with host networking so RTP ports bind directly to the instance
docker run -d \
  --name janus \
  --restart always \
  --network host \
  -v /app/janus-sfu-conferencing/janus/janus.jcfg:/usr/local/etc/janus/janus.jcfg:ro \
  canyan/janus-gateway:latest

echo "Waiting for Janus to be ready..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:8088/janus/info > /dev/null 2>&1; then
    echo "Janus is ready."
    break
  fi
  echo "  attempt $i/20..."
  sleep 3
done

# ── Server build ──────────────────────────────────────────────────────────────
echo "=== [6/10] Building server ==="
cd /app/janus-sfu-conferencing/server

cat > .env << ENVEOF
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=sfudb
POSTGRES_USER=sfuuser
POSTGRES_PASSWORD=$PG_PASSWORD
JWT_SUPER_ADMIN_SECRET=$JWT_SA
JWT_USER_SECRET=$JWT_USER
JWT_EXPIRES_IN=24h
SERVER_PORT=3000
NODE_ENV=production
CORS_ORIGIN=*
API_BASE_URL=https://$DOMAIN
SFU_WS_URI=ws://localhost:8188
MAX_ROOMS=100
MAX_PARTICIPANTS_PER_ROOM=10
ENVEOF

npm install
npm run db:migrate
npm run build

# ── Systemd service ───────────────────────────────────────────────────────────
echo "=== [7/10] Creating systemd service ==="
cat > /etc/systemd/system/janus-server.service << 'SVCEOF'
[Unit]
Description=Janus SFU Conference Server
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/app/janus-sfu-conferencing/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
EnvironmentFile=/app/janus-sfu-conferencing/server/.env

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl enable janus-server
systemctl start janus-server

# ── Nginx — HTTP only first so certbot can verify the domain ──────────────────
echo "=== [8/10] Configuring nginx (HTTP) ==="

cat > /etc/nginx/conf.d/janus-sfu.conf << NGINXEOF
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
sleep 5  # give nginx time to fully start before certbot attempts HTTP-01 challenge

# ── Let's Encrypt certificate ─────────────────────────────────────────────────
echo "=== [9/10] Obtaining SSL certificate ==="
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --register-unsafely-without-email

# ── Client build (with HTTPS URLs) ───────────────────────────────────────────
echo "=== [10/10] Building client ==="
cd /app/janus-sfu-conferencing/client

cat > .env.production << ENVEOF
VITE_WS_URL=https://$DOMAIN
VITE_API_URL=https://$DOMAIN/api
ENVEOF

npm install
npm run build

mkdir -p /usr/share/nginx/html/client
cp -r dist/* /usr/share/nginx/html/client/

systemctl reload nginx

echo ""
echo "========================================"
echo "  SERVER READY"
echo "========================================"
echo "  Public IP : $PUBLIC_IP"
echo "  Domain    : https://$DOMAIN"
echo "========================================"
