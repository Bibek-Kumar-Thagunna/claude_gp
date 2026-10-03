# On-call

1. Acknowledge pages within the team target, assess customer/data/finance impact, choose severity, and open an incident record for SEV-1/2. Escalate if no mitigation path is clear within 15 minutes.
2. Check deploys/config/credential changes, golden signals, dependencies, queue depth, database locks/connections, Redis, storage, and provider status. Correlation is not proof; record evidence.
3. Stabilize with reversible actions: halt a rollout, scale within safe limits, shed noncritical load, or invoke a focused runbook. Never improvise finance/database mutations.
4. For SEV-1, assign incident commander, operations, communications, and scribe. Set the next update time even when there is no change.
5. At handoff, state impact, severity, timeline, hypotheses/evidence, actions/results, current metrics, active access, next decisions, and named owners.
6. Close only after recovery verification and observation. Schedule review, action owners, and alert/runbook improvements.
