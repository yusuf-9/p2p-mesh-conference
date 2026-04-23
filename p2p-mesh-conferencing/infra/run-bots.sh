#!/bin/bash

# ── Predefined regions ────────────────────────────────────────────────────────
REGIONS=("ap-south-1" "ap-south-2" "ap-southeast-1")
# ─────────────────────────────────────────────────────────────────────────────

echo "================================"
echo "   P2P Mesh Load Test Launcher  "
echo "================================"
echo ""
echo "Regions: ${REGIONS[*]}"
echo ""

read -p "Room URL: " ROOM_URL
read -p "Bots per region: " BOTS_PER_REGION

TOTAL=$(( ${#REGIONS[@]} * BOTS_PER_REGION ))
echo ""
echo "Launching $BOTS_PER_REGION bot(s) × ${#REGIONS[@]} regions = $TOTAL bots total..."
echo ""

APPLY_TIMEOUT=240  # seconds before giving up on a region

for REGION in "${REGIONS[@]}"; do
  echo "--- Launching in $REGION ---"
  terraform workspace select "$REGION" 2>/dev/null || terraform workspace new "$REGION"
  timeout "$APPLY_TIMEOUT" terraform apply -auto-approve \
    -target=aws_instance.bot \
    -target=aws_security_group.bot \
    -var="bot_count=$BOTS_PER_REGION" \
    -var="room_url=$ROOM_URL" \
    -var="region=$REGION"
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 124 ]; then
    echo "WARNING: $REGION timed out after ${APPLY_TIMEOUT}s — skipping"
  elif [ $EXIT_CODE -ne 0 ]; then
    echo "WARNING: $REGION failed (exit $EXIT_CODE) — skipping"
  fi
  echo ""
done

terraform workspace select default

echo "================================"
echo "  $TOTAL bots launched!"
echo "================================"
