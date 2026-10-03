# Kubernetes deployment

The base provisions an internal ClamAV scanner for uploads and selects the real Baato, Sparrow, Expo push and S3 adapters. Replace application image tags, every `example.invalid` domain, ingress class/hosts, external service endpoints, and egress CIDRs before use. API startup deliberately rejects the reserved domains. The cluster must provide ingress, TLS, PostgreSQL/PostGIS, Redis, object storage, a storage class for ClamAV signatures, and a secret manager. Keep ClamAV's unauthenticated TCP port private; see `docs/runbooks/file-safety.md`.

Create a `gopasal-runtime` Secret out-of-band in the target namespace. It must contain at least `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SPARROW_SMS_TOKEN`, `SPARROW_SMS_FROM`, `BAATO_ACCESS_TOKEN`, `BAATO_BROWSER_ACCESS_TOKEN`, `MAP_PIN_BROWSER_TOKEN`, `S3_BUCKET`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY`. Add eSewa/Khalti credentials only when those methods are being enabled. Never commit rendered secrets. Build-time `NEXT_PUBLIC_*` values are embedded in web images and must be supplied while building.

Build the customer image with `MAP_PIN_PROVIDER=google` so its Content Security Policy permits the Google address picker. The API still uses `MAP_PROVIDER=baato` for Nepal routing, reverse geocoding and tracking; Google content is not mixed onto Baato maps. If Google pinning is not enabled, build with `MAP_PIN_PROVIDER=baato` and omit `MAP_PIN_BROWSER_TOKEN` only after changing the API ConfigMap to match.

Replace `PUBLIC_URL`, `CUSTOMER_WEB_URL`, and every `CORS_ORIGINS` entry with exact HTTPS origins. Origins must not contain paths. `TRUST_PROXY=1` assumes exactly one ingress/reverse-proxy hop; change it to the actual hop count or trusted CIDRs if the cluster topology differs.

Render before applying:

```sh
kubectl kustomize deploy/k8s/overlays/staging > /tmp/gopasal-staging.yaml
kubectl apply --server-side --dry-run=server -f /tmp/gopasal-staging.yaml
```

Run the migration Job and wait for success before updating Deployments. Because Jobs are immutable, delete only the completed migration Job before applying a new release. Follow `docs/runbooks/deploy.md`; do not use the all-resources render as a substitute for ordered deployment.
