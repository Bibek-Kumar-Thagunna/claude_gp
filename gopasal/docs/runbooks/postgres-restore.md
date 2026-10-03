# PostgreSQL restore

**Gate:** Incident commander and database owner approval. A restore overwrites the selected target and may lose writes after the recovery point.

1. Identify target, recovery point objective, backup checksum, encryption/access controls, and downstream write freeze. Prefer restoring into an isolated database first.
2. Download through the approved encrypted channel. Verify checksum and backup metadata without exposing the dump publicly.
3. Set a dedicated destination URL, then run `TARGET_ENVIRONMENT=<env> EXPECTED_DATABASE=<db> CONFIRM_TARGET='RESTORE <env>/<db>' RESTORE_DATABASE_URL='<url>' scripts/restore-postgres.sh <dump>`.
4. Run schema/migration status checks, row-count/integrity sampling, PostGIS checks, application smoke tests, and finance reconciliation in isolation.
5. For cutover, stop writers, account for recovery-point data loss, rotate the connection endpoint/secret, restart workloads gradually, and monitor.
6. Record backup identity, lost-write interval, approvals, checks, and secure disposal date for temporary copies.
