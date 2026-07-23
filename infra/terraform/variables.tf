variable "aws_region" {
  type    = string
  default = "eu-west-1"
}
variable "environment" {
  type = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be staging or production."
  }
}
variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}
variable "database_name" {
  type    = string
  default = "quantum_parks"
}
variable "database_username" {
  type    = string
  default = "quantum_parks"
}
variable "database_password" {
  type      = string
  sensitive = true
}
variable "certificate_arn" { type = string }
variable "admin_hostname" { type = string }
variable "customer_hostname" { type = string }
variable "api_hostname" { type = string }
variable "container_images" {
  type = object({
    admin_web    = string
    customer_web = string
    api          = string
    worker       = string
  })
  description = "Immutable, digest-pinned images promoted by CI. Simulator images are deliberately absent."
}
variable "desired_count" {
  type    = number
  default = 2
}
variable "temporal_address" {
  type        = string
  description = "Approved managed Temporal endpoint reachable from the private subnets."
}
variable "temporal_namespace" {
  type    = string
  default = "quantum-parks"
}
variable "oidc_issuer" { type = string }
variable "oidc_client_id" { type = string }
variable "oidc_audience" { type = string }
variable "cognito_user_pool_arn" {
  type        = string
  description = "Production Cognito user pool used by the ALB admin authentication action."
}
variable "cognito_user_pool_domain" {
  type        = string
  description = "Cognito hosted UI domain prefix configured for the admin listener."
}
variable "elevenlabs_base_url" {
  type        = string
  description = "Verified regional ElevenLabs API base URL."
}
variable "elevenlabs_workspace_id" { type = string }
variable "enrichment_provider" {
  type    = string
  default = "openai-responses"
  validation {
    condition     = contains(["openai-responses", "deterministic-local"], var.enrichment_provider)
    error_message = "Enrichment provider must be explicitly supported."
  }
}
variable "openai_api_secret_arn" {
  type      = string
  default   = null
  nullable  = true
  sensitive = true
}
variable "openai_model" {
  type        = string
  default     = "NOT_CONFIGURED"
  description = "Configuration-driven enrichment model; readiness verifies capability."
}
variable "production_retention_approved" {
  type    = bool
  default = false
}
variable "provider_privacy_approved" {
  type    = bool
  default = false
}
variable "caller_disclosure_approved" {
  type    = bool
  default = false
}
variable "native_language_approvals" {
  type    = string
  default = ""
}
variable "active_operator_queues" {
  type    = bool
  default = false
}
variable "active_message_templates" {
  type    = bool
  default = false
}
