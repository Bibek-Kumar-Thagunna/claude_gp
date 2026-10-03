# Provider wrappers should replace these contract-shaped placeholders with real outputs.
output "required_interfaces" {
  description = "Interfaces the provider-specific implementation must expose to deployment automation."
  value = {
    kubernetes = ["cluster_endpoint", "ca_certificate", "workload_identity"]
    postgres   = ["private_host", "port", "database", "runtime_secret_ref", "migration_secret_ref"]
    redis      = ["private_host", "port", "secret_ref"]
    storage    = ["private_bucket", "public_asset_origin", "workload_identity"]
    operations = ["registry", "log_destination", "metric_destination", "alert_route"]
  }
}

output "environment" {
  description = "Validated environment name."
  value       = var.environment
}
