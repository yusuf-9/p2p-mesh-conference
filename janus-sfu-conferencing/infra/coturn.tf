# Allocate Elastic IP for coturn server
resource "aws_eip" "coturn" {
  domain = "vpc"
}

# Security group for coturn - allow all TURN ports from anywhere
resource "aws_security_group" "coturn" {
  name        = "janus-sfu-coturn"
  description = "Coturn STUN/TURN server"

  ingress {
    description = "STUN/TURN"
    from_port   = 3478
    to_port     = 3478
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "STUN/TURN TLS"
    from_port   = 5349
    to_port     = 5349
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "STUN/TURN TLS TCP"
    from_port   = 5349
    to_port     = 5349
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "TURN over TLS (443)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Relay ports UDP"
    from_port   = 49152
    to_port     = 65535
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "janus-sfu-coturn"
    Purpose = "coturn-stun-turn"
  }
}

resource "aws_instance" "coturn" {
  ami           = data.aws_ami.al2023.id
  instance_type = "t3.small"

  vpc_security_group_ids = [aws_security_group.coturn.id]
  key_name               = "loadtest-server"

  root_block_device {
    volume_size = 8
  }

  user_data = templatefile("${path.module}/coturn_startup.sh", {
    public_ip   = aws_eip.coturn.public_ip
    turn_secret = var.turn_secret
  })

  tags = {
    Name    = "janus-sfu-coturn"
    Purpose = "coturn-stun-turn"
  }
}

resource "aws_eip_association" "coturn" {
  instance_id   = aws_instance.coturn.id
  allocation_id = aws_eip.coturn.id
}

output "coturn_ip" {
  value       = aws_eip.coturn.public_ip
  description = "Public IP of the coturn server"
}