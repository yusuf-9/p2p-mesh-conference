#!/bin/bash
set -e
exec > /var/log/loadtest.log 2>&1

ROOM_URL="${room_url}"
BOT_INDEX="${bot_index}"

echo "=== Bot $BOT_INDEX starting ==="

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs git

# Install Chrome system dependencies
dnf install -y \
  atk cups-libs gtk3 libXcomposite libXcursor libXdamage \
  libXext libXi libXrandr libXtst pango alsa-lib nss \
  libdrm mesa-libgbm xorg-x11-fonts-Type1 xorg-x11-fonts-misc

# Pull the load test code
git clone https://github.com/yusuf-9/p2p-mesh-conference.git /app
cd /app/p2p-mesh-conferencing/load-test

npm install
npx puppeteer browsers install chrome

echo "=== Launching bot $BOT_INDEX ==="
node src/index.js "$ROOM_URL" 1

echo "=== Bot $BOT_INDEX done ==="
