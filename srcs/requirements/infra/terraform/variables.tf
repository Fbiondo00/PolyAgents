# ── General ───────────────────────────────────────────────────────────

variable "project" {
  description = "Project name used as resource prefix"
  type        = string
  default     = "polyagents"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"
}

# ── Network ───────────────────────────────────────────────────────────

variable "region" {
  description = "AWS region (Virginia for min latency to Polymarket)"
  type        = string
  default     = "us-east-1"
}

variable "availability_zone" {
  description = "Single AZ for EC2 + RDS colocation"
  type        = string
  default     = "us-east-1a"
}

# ── EC2 ───────────────────────────────────────────────────────────────

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "engine_port" {
  description = "Port the Rust engine listens on"
  type        = number
  default     = 8080
}

# ── RDS ───────────────────────────────────────────────────────────────

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "rds_username" {
  description = "RDS master username"
  type        = string
  default     = "postgres"
}

variable "rds_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "rds_db_name" {
  description = "Database name"
  type        = string
  default     = "polyagents"
}

# ── S3 / CloudFront ──────────────────────────────────────────────────

variable "domain_name" {
  description = "Custom domain for CloudFront (optional)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for custom domain (required if domain_name is set)"
  type        = string
  default     = ""
}
