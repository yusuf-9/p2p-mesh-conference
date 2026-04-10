#!/bin/bash

echo "================================"
echo "   P2P Mesh Load Test Launcher  "
echo "================================"
echo ""

read -p "Room URL: " ROOM_URL
read -p "Number of bots: " BOT_COUNT

echo ""
echo "Launching $BOT_COUNT bot(s)..."
echo ""

terraform apply \
  -target=aws_instance.bot \
  -target=aws_security_group.bot \
  -var="bot_count=$BOT_COUNT" \
  -var="room_url=$ROOM_URL"
