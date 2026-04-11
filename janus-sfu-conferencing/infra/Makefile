# ── Server ────────────────────────────────────────────────────────────────────

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
