# ── Server ────────────────────────────────────────────────────────────────────

# Step 1: allocate the IP first, point DNS to it, then run server-start
eip-allocate:
	terraform apply -target=aws_eip.server

server-start:
	terraform apply -target=aws_instance.server \
		-target=aws_security_group.server \
		-target=aws_eip.server \
		-target=aws_eip_association.server
	@echo "Waiting for SSH to become available..."
	@sleep 30
	@IP=$$(terraform output -raw server_ip) && \
	 ssh -i ~/.ssh/loadtest-server.pem -o StrictHostKeyChecking=no ec2-user@$$IP \
	   "tail -f /var/log/server-startup.log"

server-stop:
	terraform destroy -target=aws_instance.server \
		-target=aws_eip_association.server

# ── Everything ────────────────────────────────────────────────────────────────

all-stop:
	terraform destroy
