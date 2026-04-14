#!/bin/bash

# ── Predefined regions (must match run-bots.sh) ───────────────────────────────
REGIONS=("us-east-1" "us-west-2" "eu-west-1")
# ─────────────────────────────────────────────────────────────────────────────

echo "Stopping all bots across ${#REGIONS[@]} regions..."
echo ""

for REGION in "${REGIONS[@]}"; do
  echo "--- Stopping bots in $REGION ---"
  if terraform workspace select "$REGION" 2>/dev/null; then
    terraform destroy -auto-approve \
      -target=aws_instance.bot \
      -var="bot_count=0" \
      -var="room_url=placeholder" \
      -var="region=$REGION"
  else
    echo "No workspace for $REGION — skipping."
  fi
  echo ""
done

terraform workspace select default

echo "================================"
echo "  All bots stopped!"
echo "================================"
