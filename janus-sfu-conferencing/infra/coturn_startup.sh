#!/bin/bash
set -e
exec > /var/log/coturn-startup.log 2>&1

# ── Terraform-injected values ─────────────────────────────────────────────────
PUBLIC_IP="${public_ip}"
TURN_SECRET="${turn_secret}"

echo "=== [1/5] Coturn server starting — IP: $PUBLIC_IP ==="

# ── Docker ────────────────────────────────────────────────────────────────────
echo "=== [2/5] Installing Docker ==="
dnf install -y docker
systemctl enable docker
systemctl start docker

# ── Coturn config ─────────────────────────────────────────────────────────────
echo "=== [3/5] Creating coturn config ==="
mkdir -p /etc/coturn

cat > /etc/coturn/turnserver.conf << COTURNEOF
listening-port=3478
external-ip=$PUBLIC_IP
realm=turn.yourdomain.com
use-auth-secret
static-auth-secret=$TURN_SECRET
no-tls
no-dtls
verbose
# Relay ports for media
min-port=49152
max-port=65535
COTURNEOF

echo "Created coturn config with secret: ***"

# ── Run Coturn container ─────────────────────────────────────────────────────
echo "=== [4/5] Starting Coturn in Docker ==="
docker run -d \
  --name coturn \
  --restart always \
  --network host \
  -v /etc/coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro \
  coturn/coturn:latest \
  -c /etc/coturn/turnserver.conf

# ── Verify ──────────────────────────────────────────────────────────────────
echo "=== [5/5] Verifying Coturn ==="
for i in $(seq 1 10); do
  if docker exec coturn turnadmin -L 127.0.0.1 -u test -r test 2>&1 | grep -q "No listener"; then
    echo "Coturn is running."
    break
  fi
  echo "  attempt $i/10..."
  sleep 2
done

echo ""
echo "========================================"
echo "  COTURN SERVER READY"
echo "  Public IP : $PUBLIC_IP"
echo "  STUN port : 3478 UDP/TCP"
echo "  Relay     : 49152-65535 UDP"
echo "========================================"