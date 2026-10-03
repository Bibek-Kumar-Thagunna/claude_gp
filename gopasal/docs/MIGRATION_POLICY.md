# Database migration policy

1. Migrations are immutable after merge. Correct mistakes with a new migration; never edit an applied migration.
2. Use expand/migrate/contract for breaking changes. Deploy additive schema first, backfill with a resumable bounded job, switch application reads/writes, then remove old schema in a later release.
3. Avoid table rewrites and long locks. For large tables, create indexes concurrently where PostgreSQL permits and set explicit lock/statement timeouts in reviewed SQL.
4. Every change documents expected duration, lock behavior, rollback/forward-fix, disk growth, and required application compatibility.
5. CI runs `prisma validate`, a clean install, and an upgrade from the previous migration. Staging must use production-like data volume before approval.
6. Production migrations run once as a dedicated least-privilege Job before workloads roll. Application startup never performs migrations.
7. Back up and verify restore readiness before destructive or irreversible changes. A rollback of application code is not a schema rollback.
8. Failed migrations follow `docs/runbooks/migration-failure.md`; do not mark a migration resolved until database state and SQL effects are independently verified.
