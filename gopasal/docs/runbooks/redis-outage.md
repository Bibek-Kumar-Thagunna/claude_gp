# Redis outage

1. Confirm scope from API errors, queue depth, connection saturation, latency, and provider health. Do not flush Redis or disable authentication.
2. Reduce retry storms: pause nonessential workers/jobs through approved deployment controls and rate-limit expensive paths. Preserve PostgreSQL as the source of truth.
3. Check DNS/TLS/auth changes, memory eviction, connection limits, failover state, persistence errors, and network policy. Restore service or fail over through the provider procedure.
4. Restart clients gradually only if they do not reconnect. Watch duplicate jobs and callbacks; consumers must be treated as at-least-once.
5. Validate login/session behavior, queues, real-time events, rate limits, and delayed work. Reconcile jobs against durable database state before replay.
6. Record dropped/duplicated work, customer impact, and capacity/remediation actions.
