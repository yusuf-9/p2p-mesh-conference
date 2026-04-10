terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_security_group" "bot" {
  name        = "loadtest-bot"
  description = "Load test bots - outbound only"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "bot" {
  count         = var.bot_count
  ami           = data.aws_ami.al2023.id
  instance_type = "t3.small"

  vpc_security_group_ids = [aws_security_group.bot.id]
  key_name               = "loadtest-server"

  root_block_device {
    volume_size = 20
  }

  user_data = templatefile("${path.module}/startup.sh", {
    room_url  = var.room_url
    bot_index = count.index + 1
  })

  tags = {
    Name    = "loadtest-bot-${count.index + 1}"
    Purpose = "loadtest"
  }
}

output "instance_ids" {
  value = aws_instance.bot[*].id
}
