# Provider-neutral infrastructure contract

This directory defines what GoPasal needs from infrastructure, not how a particular cloud creates it. There are intentionally no provider blocks or resources. Platform teams should wrap `modules/platform-contract`, map its inputs to their provider-specific modules, and return the declared outputs.

Required capabilities:

- A Kubernetes cluster with workload identity, ingress, TLS automation, DNS integration, NetworkPolicy enforcement, and a CSI/storage class suitable for temporary volumes.
- PostgreSQL 16 with PostGIS 3.4, encrypted connections, automated backups, point-in-time recovery, monitoring, and separate least-privilege runtime/migration identities.
- Redis 7 with authentication, encryption in transit, persistence appropriate to queue semantics, failover, and monitoring.
- S3-compatible object storage with private-by-default buckets, separate public asset delivery, versioning/lifecycle controls, access logs, and tightly scoped workload credentials.
- A secret manager, container registry, centralized logs/metrics/traces, alert routing, DNS, and managed TLS certificates.

Consumers must set real SLOs, retention, regions, sizes, and CIDRs. The defaults in the contract are validation aids, not production sizing recommendations. Outputs are marked sensitive where they may expose topology; credentials must never be Terraform outputs or state values.

Example wrapper:

```hcl
module "contract" {
  source      = "./modules/platform-contract"
  environment = "staging"
  region      = var.region
  network_cidr = var.network_cidr
  tags        = var.tags
}
```

Run `terraform fmt -check -recursive` and `terraform validate` in a provider-specific root that instantiates real resources. This contract alone intentionally has nothing to apply.
