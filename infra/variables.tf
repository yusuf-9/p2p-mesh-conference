# ── Bot variables ────────────────────────────────────────────────────────────

variable "bot_count" {
  description = "Number of bot instances to launch"
  default     = 1
}

variable "room_url" {
  description = "Full room URL with room_id and api_key params"
  default     = "placeholder"
}

# ── Server variables ──────────────────────────────────────────────────────────

variable "domain" {
  description = "Domain name for the server (e.g. p2pmeshtest.duckdns.org)"
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
