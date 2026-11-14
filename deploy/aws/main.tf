terraform {
  required_version = ">= 1.13.3, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.43.0"
    }
  }
}

variable "region" { type = string }
variable "vpc_id" { type = string }
variable "subnet_id" { type = string }
variable "ami_id" { type = string }
variable "instance_type" { type = string }
variable "data_gib" {
  type    = number
  default = 40
  validation {
    condition     = var.data_gib >= 20 && var.data_gib <= 1000
    error_message = "Operator must choose 20–1000 GiB of durable data."
  }
}

provider "aws" { region = var.region }
data "aws_subnet" "selected" { id = var.subnet_id }

resource "aws_security_group" "service" {
  name_prefix = "always-on-v03-"
  description = "Public HTTPS edge only; no SSH, Harness owner or controller port"
  vpc_id      = var.vpc_id
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
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

resource "aws_iam_role" "operator_ssm" {
  name_prefix = "always-on-v03-ssm-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" } }]
  })
}
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.operator_ssm.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_instance_profile" "ssm" { role = aws_iam_role.operator_ssm.name }

resource "aws_ebs_volume" "state" {
  availability_zone = data.aws_subnet.selected.availability_zone
  type              = "gp3"
  size              = var.data_gib
  encrypted         = true
  tags              = { Name = "always-on-v03-durable-state", BackupRequired = "true" }
  lifecycle { prevent_destroy = true }
}

resource "aws_instance" "service" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.service.id]
  iam_instance_profile   = aws_iam_instance_profile.ssm.name
  monitoring             = true
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    # Containers intentionally do not receive instance-profile credentials.
    http_put_response_hop_limit = 1
  }
  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }
  tags = { Name = "always-on-v03-operator-runtime" }
}
resource "aws_volume_attachment" "state" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.state.id
  instance_id = aws_instance.service.id
}
resource "aws_eip" "service" {
  domain   = "vpc"
  instance = aws_instance.service.id
}

output "operator_instance_id" { value = aws_instance.service.id }
output "public_ipv4" { value = aws_eip.service.public_ip }
output "durable_volume_id" { value = aws_ebs_volume.state.id }
