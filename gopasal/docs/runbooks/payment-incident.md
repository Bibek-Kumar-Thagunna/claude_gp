# Payment incident

Treat unauthorized charges, incorrect amounts, duplicate captures, callback forgery, or ledger divergence as SEV-1. Do not issue ad-hoc database updates or refunds.

1. Freeze affected payment initiation/capture through approved provider or feature controls while preserving callback receipt if safe. Notify finance, security, support, and provider contacts.
2. Bound scope by provider, method, release, time, order/payment state, and amount. Preserve signed callback payload metadata and provider event IDs; restrict access to sensitive data.
3. Compare provider records, payment intents, orders, callbacks, refunds, and ledger entries using immutable IDs. Separate pending/delayed from duplicate/incorrect transactions.
4. Require finance approval for refunds/voids. Execute through provider APIs/consoles with idempotency and dual control, then retain references.
5. Restore traffic gradually after signature validation, amount/currency checks, idempotency, and reconciliation pass.
6. Communicate customer actions through approved support/legal wording and produce a signed incident reconciliation.
