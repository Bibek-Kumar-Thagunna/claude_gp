# Observability templates

`otel-collector.yaml` is a collector configuration fragment, not a complete deployment. Inject `DEPLOYMENT_ENVIRONMENT` and a trusted TLS `OTEL_EXPORTER_OTLP_ENDPOINT`; supply exporter authentication through the secret manager. Do not collect request bodies, authorization headers, identity documents, payment details, or credentials.

`prometheus-rules.yaml` assumes kube-state-metrics and ingress-nginx metric names. Adapt selectors and metric names to the installed stack, replace relative `runbook_url` values with durable URLs, and test every expression against staging before enabling paging.

The API exposes Prometheus data only on its separate internal port `9464`; it is
not part of the public API ingress. The pod annotations select `/metrics`, and
the default-deny policy permits that port only from a namespace named
`monitoring`. Rename that selector if your Prometheus installation uses another
namespace. HTTP labels use route templates, never order IDs, phones, query
strings or other customer data. Business gauges are identical on each API pod,
so aggregate those with `max`, not `sum`.
