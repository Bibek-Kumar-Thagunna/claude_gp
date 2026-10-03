# Operations runbooks

Use these procedures with the incident commander, communications lead, and operations lead named in the incident record. Record commands, timestamps in UTC, dashboards, decisions, and approvers. Never paste credentials, payment data, identity documents, access tokens, or raw customer records into tickets or chat.

Severity guidance: SEV-1 is active security/data loss, payment integrity failure, or platform-wide unavailability; SEV-2 is major degraded service; SEV-3 is limited impact. Page the on-call for SEV-1/2. Prefer reversible mitigation, preserve evidence, and maintain an explicit next update time.

Placeholders such as `<namespace>`, `<release>`, and `<provider-console>` require environment-specific values. Commands that mutate production require peer confirmation and the relevant procedure's approval gate.

Upload-safety outages and ClamAV operation: [file-safety.md](file-safety.md).
