# Security incident

1. Declare severity, name incident commander/security lead/scribe, open a restricted record, and start a UTC timeline. Use a clean communication channel if account compromise is possible.
2. Contain with the smallest reversible action: revoke sessions/credentials, isolate workloads, block indicators, or disable a path. Preserve volatile evidence before restarts where feasible.
3. Preserve cloud/Kubernetes/application/database/storage/identity audit logs with hashes and access controls. Do not alter suspected hosts or share raw personal data broadly.
4. Determine entry point, affected identities/systems/data, persistence, lateral movement, and exfiltration. Engage privacy/legal and providers early.
5. Eradicate, rotate credentials, patch from trusted artifacts, restore clean service, and monitor for recurrence. Validate finance and data integrity.
6. Meet notification obligations using verified scope. Complete lessons learned and tracked corrective actions; preserve evidence under legal retention instructions.
