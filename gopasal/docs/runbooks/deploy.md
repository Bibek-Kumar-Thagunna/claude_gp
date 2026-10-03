# Deploy

**Gate:** Approved change, green CI, immutable image digest, migration review, current backup/restore evidence, staffed rollback window, and no active incident.

1. Announce release/digest, environment, owner, expected customer impact, and rollback deadline. Capture pre-deploy latency, error rate, saturation, queue depth, and payment success.
2. Render the overlay and run `kubectl apply --server-side --dry-run=server -f <rendered.yaml>`. Confirm placeholders are gone and Secret references exist without printing values.
3. Apply only the migration Job, wait with `kubectl wait --for=condition=complete job/<job> --timeout=15m`, and inspect logs. Stop on any failure; use the migration-failure runbook.
4. Apply the scanner Service/StatefulSet and verify its readiness before routing uploads. Apply Deployments, Services, Ingress, policies, and PDBs. Watch `kubectl rollout status deployment/<name> --timeout=10m` for every app workload and `kubectl rollout status statefulset/clamav --timeout=15m` for the scanner. See [file safety](file-safety.md) if it cannot load signatures.
5. Confirm the Prometheus target for every API pod is `UP`, `/metrics` is reachable only from the monitoring namespace, the dependency gauges are healthy, and the GoPasal alert rules loaded without evaluation errors. Do not add the metrics port to the public ingress.
6. Smoke-test health, login, read-only catalog, one controlled order/payment in the provider sandbox or approved low-value production path, and admin/seller access.
7. Compare golden signals and finance counters for at least 30 minutes. Announce completion with evidence and release metadata.

Do not roll application code back if the migration is not backward compatible. Follow the migration policy and use a forward fix.
