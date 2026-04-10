# Allocate Elastic IP first so we know the address before the instance boots.
# The startup script bakes this IP into the client build and nginx config.
resource "aws_eip" "server" {
  domain = "vpc"
}

resource "aws_security_group" "server" {
  name        = "loadtest-server"
  description = "P2P mesh server - HTTP inbound"

  ingress {
    description = "All traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "server" {
  ami           = data.aws_ami.al2023.id
  instance_type = "t3.small"

  vpc_security_group_ids = [aws_security_group.server.id]
  key_name               = "loadtest-server"

  # Needs at least 20GB — Node build + Postgres + Chrome deps
  root_block_device {
    volume_size = 20
  }

  user_data = templatefile("${path.module}/server_startup.sh", {
    public_ip              = aws_eip.server.public_ip
    domain                 = var.domain
    postgres_password      = var.postgres_password
    jwt_super_admin_secret = var.jwt_super_admin_secret
    jwt_admin_secret       = var.jwt_admin_secret
    jwt_user_secret        = var.jwt_user_secret
  })

  tags = {
    Name    = "loadtest-server"
    Purpose = "loadtest"
  }
}

# Associate the pre-allocated EIP with the instance
resource "aws_eip_association" "server" {
  instance_id   = aws_instance.server.id
  allocation_id = aws_eip.server.id
}

output "server_ip" {
  value       = aws_eip.server.public_ip
  description = "Public IP of the server"
}

output "server_url" {
  value       = "http://${aws_eip.server.public_ip}"
  description = "URL to open in the browser"
}

output "server_instance_id" {
  value       = aws_instance.server.id
  description = "Instance ID — use with: aws ssm start-session --target <id>"
}
