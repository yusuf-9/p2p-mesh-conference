ROOM_URL ?= placeholder
BOT_COUNT ?= 1
REGION ?= us-east-1

# ── Server ────────────────────────────────────────────────────────────────────

server-start:
	terraform apply -target=aws_instance.server \
		-target=aws_security_group.server \
		-target=aws_eip.server \
		-target=aws_eip_association.server

server-stop:
	terraform destroy -target=aws_instance.server \
		-target=aws_eip_association.server \
		-var="room_url=placeholder"

# ── Bots ──────────────────────────────────────────────────────────────────────

bots-start:
	@bash run-bots.sh

bots-stop:
	@bash stop-bots.sh

# ── Everything ────────────────────────────────────────────────────────────────

all-stop:
	terraform destroy
