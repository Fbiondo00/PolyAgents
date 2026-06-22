terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
    }
  }
}

# ── Data sources ──────────────────────────────────────────────────────

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── Network ───────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "${var.project}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project}-igw" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = true

  tags = { Name = "${var.project}-public" }
}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = var.availability_zone

  tags = { Name = "${var.project}-private" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.project}-public-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# ── Security Groups ───────────────────────────────────────────────────

resource "aws_security_group" "engine" {
  name        = "${var.project}-engine"
  description = "PolyAgents Rust engine"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP API"
    from_port   = var.engine_port
    to_port     = var.engine_port
    protocol    = "tcp"
    # Engine API is restricted to known CIDRs (defaults to the VPC CIDR).
    # An empty list produces no ingress rule, which effectively denies the port.
    cidr_blocks = length(var.engine_allowed_cidrs) > 0 ? var.engine_allowed_cidrs : null
  }

  # SSH ingress is only attached when at least one CIDR is provided.
  # Default is an empty list (deny all) — use SSM Session Manager or a bastion
  # instead of exposing port 22 to the internet.
  dynamic "ingress" {
    for_each = length(var.ssh_allowed_cidrs) > 0 ? [1] : []
    content {
      description = "SSH"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = var.ssh_allowed_cidrs
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-engine-sg" }
}

resource "aws_security_group" "db" {
  name        = "${var.project}-db"
  description = "RDS PostgreSQL"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from engine"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.engine.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-db-sg" }
}

# ── RDS PostgreSQL ────────────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-db-subnet"
  subnet_ids = [aws_subnet.public.id, aws_subnet.private.id]

  tags = { Name = "${var.project}-db-subnet-group" }
}

resource "aws_db_instance" "postgres" {
  identifier     = "${var.project}-db"
  engine         = "postgres"
  engine_version = "15"
  instance_class = var.rds_instance_class

  db_name  = var.rds_db_name
  username = var.rds_username
  password = var.rds_password

  allocated_storage     = 20
  max_allocated_storage = 40
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  availability_zone      = var.availability_zone

  # Keep automated backups for a meaningful retention window and always take a
  # final snapshot on destroy so production data (trades, vault state, orders)
  # is recoverable. `skip_final_snapshot` and `delete_automated_backups` are
  # intentionally omitted (both default to false).
  backup_retention_period = 14
  # Name is unique per destroy run via a timestamp suffix to avoid clashes.
  final_snapshot_identifier = "${var.project}-db-final-${formatdate("YYYYMMDDHHmmss", timestamp())}"

  deletion_protection = var.environment == "prod" ? true : false

  tags = { Name = "${var.project}-db" }
}

# ── EC2 Instance ──────────────────────────────────────────────────────

resource "aws_key_pair" "deploy" {
  key_name   = "${var.project}-deploy"
  public_key = fileexists("~/.ssh/id_rsa.pub") ? file("~/.ssh/id_rsa.pub") : ""

  lifecycle {
    ignore_changes = [public_key]
  }
}

resource "aws_instance" "engine" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  availability_zone      = var.availability_zone
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.engine.id]
  key_name               = aws_key_pair.deploy.key_name

  user_data = templatefile("${path.module}/user-data.sh", {
    database_url = "postgres://${var.rds_username}:${var.rds_password}@${aws_db_instance.postgres.address}:5432/${var.rds_db_name}?sslmode=require"
    engine_port  = var.engine_port
    # RDS connectivity is checked by a wait loop at boot. These drive the timeout.
    db_host = aws_db_instance.postgres.address
    db_port = 5432
    # OpenAI config is injected only when supplied via Terraform; an unset key
    # is written out as a commented line so the engine never sees an empty
    # OPENAI_API_KEY value (which would still satisfy env::var and 401).
    openai_api_base = var.openai_api_base
    # The literal .env line for the key — real assignment when a key is set,
    # or a commented placeholder otherwise.
    openai_key_line = var.openai_api_key != "" ? "OPENAI_API_KEY=${var.openai_api_key}" : "# OPENAI_API_KEY=  # not provided at provision time — set before starting the engine"
    openai_model    = var.openai_model
  })

  tags = { Name = "${var.project}-engine" }
}

# ── S3 + CloudFront (frontend) ───────────────────────────────────────

resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project}-frontend"

  tags = { Name = "${var.project}-frontend" }
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "s3-frontend"
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "s3-frontend"

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    viewer_protocol_policy = "redirect-to-https"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    acm_certificate_arn            = var.acm_certificate_arn != "" ? var.acm_certificate_arn : null
    ssl_support_method             = var.acm_certificate_arn != "" ? "sni-only" : null
  }

  aliases = var.domain_name != "" ? [var.domain_name] : []

  tags = { Name = "${var.project}-cdn" }
}

# ── Outputs ───────────────────────────────────────────────────────────

output "engine_public_ip" {
  description = "Public IP of the EC2 engine instance"
  value       = aws_instance.engine.public_ip
}

output "engine_api_url" {
  description = "Engine HTTP API endpoint"
  value       = "http://${aws_instance.engine.public_ip}:${var.engine_port}"
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.postgres.endpoint
}

output "cloudfront_url" {
  description = "CloudFront distribution URL for frontend"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "s3_bucket" {
  description = "S3 bucket name for frontend deploys"
  value       = aws_s3_bucket.frontend.bucket
}
