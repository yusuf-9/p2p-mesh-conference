# ── Server ────────────────────────────────────────────────────────────────────

# Step 1: allocate the IPs first, point DNS to them, then run server-start
eip-allocate:
	@echo "=== Allocating EIPs for coturn and app servers ==="
	terraform apply -target=aws_eip.coturn -target=aws_eip.server
	@echo ""
	@echo "=== IMPORTANT: Update your DNS ==="
	@echo "Create A record: turn.$(terraform output -raw domain) -> $(terraform output -raw coturn_ip)"
	@echo "Create A record: $(terraform output -raw domain) -> $(terraform output -raw server_ip)"
	@echo ""

server-start:
	@echo "=== Starting App Server ==="
	terraform apply -target=aws_instance.server \
		-target=aws_security_group.server \
		-target=aws_eip.server \
		-target=aws_eip_association.server

	@echo "Waiting for SSH to become available..."
	@sleep 30
	@IP=$$(terraform output -raw server_ip) && \
	 echo "Server startup logs:" && \
	 ssh -i ~/.ssh/loadtest-server.pem -o StrictHostKeyChecking=no ec2-user@$$IP \
	   "tail -f /var/log/server-startup.log"

coturn-start:
	@echo "=== Starting Coturn Server Only ==="
	terraform apply -target=aws_instance.coturn \
		-target=aws_security_group.coturn \
		-target=aws_eip.coturn \
		-target=aws_eip_association.coturn
	@echo "Waiting for coturn server to initialize..."
	@sleep 30
	@IP=$$(terraform output -raw coturn_ip) && \
	 ssh -i ~/.ssh/loadtest-server.pem -o StrictHostKeyChecking=no ec2-user@$$IP \
	   "tail -f /var/log/coturn-startup.log"

server-stop:
	terraform destroy -target=aws_instance.server \
		-target=aws_eip_association.server

coturn-stop:
	terraform destroy -target=aws_instance.coturn \
		-target=aws_eip_association.coturn

# ── Everything ────────────────────────────────────────────────────────────────

all-stop:
	terraform destroy
