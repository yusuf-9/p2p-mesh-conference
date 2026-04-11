variable "domain" {
  description = "Domain name for the server (e.g. janussfu.duckdns.org)"
}

variable "repo_url" {
  description = "HTTPS URL of the git repository to clone on the instance"
  default     = "https://github.com/yusuf-9/p2p-mesh-conference.git"
  # Same repo as p2p-mesh-conferencing — both projects live here
}

variable "postgres_password" {
  description = "PostgreSQL password for the app DB user"
  sensitive   = true
  default     = ""
}

variable "jwt_super_admin_secret" {
  description = "JWT secret for super admin tokens"
  sensitive   = true
  default     = ""
}

variable "jwt_admin_secret" {
  description = "JWT secret for admin tokens"
  sensitive   = true
  default     = ""
}

variable "jwt_user_secret" {
  description = "JWT secret for user tokens"
  sensitive   = true
  default     = ""
}
