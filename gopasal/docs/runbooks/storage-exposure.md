# Object storage exposure

Treat suspected public access to private identity or seller documents as SEV-1.

1. Preserve evidence and timestamps, then block public access at bucket/CDN policy and revoke exposed signed URLs or credentials. Do not browse or download more records than necessary.
2. Identify bucket, object prefixes, policy/version changes, access-log window, cache behavior, and whether public assets are separate from private documents.
3. Snapshot provider audit/access logs into the evidence store. Determine exposed data classes, subjects, actors, and earliest/latest access.
4. Rotate storage credentials and workload identity bindings using the credential-rotation runbook. Purge CDN caches where exposure persists.
5. Engage privacy/legal owners for notification and regulatory timelines. Communicate only verified scope.
6. Test private denial and authorized access, add policy guardrails/alerts, and document every accessed object conservatively.
