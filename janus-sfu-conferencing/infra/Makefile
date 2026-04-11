# ── Server ────────────────────────────────────────────────────────────────────

# Step 1: allocate the IP first, point DNS to it, then run server-start
eip-allocate:
	terraform apply -target=aws_eip.server

server-start:
	terraform apply -target=aws_instance.server \
		-target=aws_security_group.server \
		-target=aws_eip.server \
		-target=aws_eip_association.server

server-stop:
	terraform destroy -target=aws_instance.server \
		-target=aws_eip_association.server

# ── Everything ────────────────────────────────────────────────────────────────

all-stop:
	terraform destroy
