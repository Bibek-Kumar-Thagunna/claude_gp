# Credential rotation

1. Inventory the credential's consumers, privileges, expiry, audit trail, and dependency order. For compromise, revoke first if dual-key overlap is unsafe; otherwise create a replacement first.
2. Create a least-privilege replacement in the authoritative secret manager. Never place values in shell history, manifests, CI logs, tickets, or Terraform outputs.
3. Update Secret synchronization and roll one canary workload. Verify authentication and audit logs, then roll all consumers.
4. Confirm no use of the old credential for an observation window. Revoke it, verify denial, and remove stale secret versions/caches according to retention policy.
5. For JWT/signing keys, preserve a controlled verification overlap until issued tokens expire unless compromise requires immediate invalidation. For database credentials, terminate old sessions after cutover.
6. Record credential identifier, owners, rotation/revocation times, affected services, evidence, and next rotation date, never the value.
