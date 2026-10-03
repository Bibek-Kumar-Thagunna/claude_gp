# Rollback

**Trigger:** SLO burn, elevated errors, integrity regression, failed smoke test, or security concern attributable to the release. The incident commander authorizes production rollback.

1. Freeze further deploys and record current/target image digests. Determine whether schema changes remain compatible with the previous release.
2. If compatible, set each Deployment image to the last known-good digest and monitor `kubectl rollout status`. Never rerun or reverse migrations automatically.
3. If incompatible, hold traffic at the safest available layer, disable affected features through approved controls, and produce a forward-fix migration/application release.
4. Verify health, core customer/seller/admin journeys, payment callback processing, queues, and reconciliation totals.
5. Keep the incident open through the observation window. Record impact, timeline, retained schema changes, and follow-up owners.
