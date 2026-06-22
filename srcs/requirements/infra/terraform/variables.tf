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

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to reach SSH (port 22). Empty list = deny all inbound SSH (use SSM/bastion instead)."
  type        = list(string)
  default     = []
}

variable "engine_allowed_cidrs" {
  description = "CIDR blocks allowed to reach the engine HTTP API. Defaults to the VPC CIDR so only intra-VPC traffic is accepted."
  type        = list(string)
  default     = ["10.0.0.0/16"]
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

# ── Engine / AI runtime ──────────────────────────────────────────────

variable "openai_api_base" {
  description = "OpenAI-compatible API base URL. Defaults to the craftshost gateway."
  type        = string
  default     = "https://openai.craftshost.com"
}

variable "openai_api_key" {
  description = "OpenAI API key. Leave empty to write a commented placeholder (engine then errors loudly instead of sending empty auth)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "openai_model" {
  description = "OpenAI model identifier used by the engine"
  type        = string
  default     = "gpt-4o"
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
