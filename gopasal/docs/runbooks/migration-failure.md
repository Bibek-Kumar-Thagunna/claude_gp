# Migration failure

1. Stop the rollout. Do not restart the Job repeatedly and do not run `migrate resolve`, manual DDL, or restore without database-owner approval.
2. Preserve Job logs, Prisma migration name/error, PostgreSQL logs, lock/activity snapshots, and migration table state. Redact connection strings.
3. Determine whether PostgreSQL rolled back the statement/transaction and whether partial non-transactional effects exist. Compare actual catalog state with migration SQL.
4. If no effects exist, fix with a new reviewed migration or corrected unmerged artifact, test clean install and upgrade, then rerun once.
5. If partial effects exist, write idempotent repair SQL and a forward migration. Test on a restored copy before approval. Use `prisma migrate resolve` only after the database owner verifies exact state and records the rationale.
6. Restore only for demonstrated corruption/data loss and follow the restore runbook. Verify application compatibility and reconciliation before reopening traffic.
