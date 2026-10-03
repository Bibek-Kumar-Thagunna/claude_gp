variable "environment" {
  description = "Deployment environment identifier."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "region" {
  description = "Provider-specific region or failure-domain group."
  type        = string
}

variable "network_cidr" {
  description = "Private network CIDR allocated to this environment."
  type        = string
  validation {
    condition     = can(cidrnetmask(var.network_cidr))
    error_message = "network_cidr must be valid CIDR notation."
  }
}

variable "availability_zones" {
  description = "Failure domains across which stateful and cluster services are spread."
  type        = list(string)
  default     = []
}

variable "postgres_version" {
  description = "Required PostgreSQL major version; implementation must also enable PostGIS."
  type        = number
  default     = 16
}

variable "redis_version" {
  description = "Required Redis major version."
  type        = number
  default     = 7
}

variable "backup_retention_days" {
  description = "Minimum database backup retention selected by the owning team."
  type        = number
  validation {
    condition     = var.backup_retention_days >= 7
    error_message = "backup retention must be at least seven days."
  }
}

variable "tags" {
  description = "Common ownership, cost, environment, and data-classification tags."
  type        = map(string)
  default     = {}
}
