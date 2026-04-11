# Allocate Elastic IP first so we know the address before the instance boots.
# The startup script bakes this IP into the janus config and client build.
resource "aws_eip" "server" {
  domain = "vpc"
}

resource "aws_security_group" "server" {
  name        = "janus-sfu-server"
  description = "Janus SFU server - all traffic"

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

  root_block_device {
    volume_size = 30
  }

  user_data = templatefile("${path.module}/server_startup.sh", {
    public_ip              = aws_eip.server.public_ip
    domain                 = var.domain
    repo_url               = var.repo_url
    postgres_password      = var.postgres_password
    jwt_super_admin_secret = var.jwt_super_admin_secret
    jwt_admin_secret       = var.jwt_admin_secret
    jwt_user_secret        = var.jwt_user_secret
  })

  tags = {
    Name    = "janus-sfu-server"
    Purpose = "janus-sfu"
  }
}

resource "aws_eip_association" "server" {
  instance_id   = aws_instance.server.id
  allocation_id = aws_eip.server.id
}

output "server_ip" {
  value       = aws_eip.server.public_ip
  description = "Public IP of the server"
}

output "server_url" {
  value       = "https://${var.domain}"
  description = "URL to open in the browser"
}

output "server_instance_id" {
  value       = aws_instance.server.id
  description = "Instance ID — use with: aws ssm start-session --target <id>"
}
