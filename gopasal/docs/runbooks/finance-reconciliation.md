# Finance reconciliation

1. Fix a UTC cutoff and obtain immutable exports from the payment provider, bank/settlement source, application payments/orders/refunds, and internal ledger. Hash and restrict exports.
2. Normalize currency in minor units, timezone, provider event ID, order/payment ID, fee, tax, refund, and settlement status. Never reconcile rounded display values.
3. Match exact IDs first, then classify unmatched items as timing, duplicate, failed callback, amount mismatch, orphan, refund mismatch, or settlement mismatch.
4. Do not edit source transactions. Post approved compensating entries with reason, source references, preparer, reviewer, and timestamp.
5. Require independent review for every adjustment and sign off opening balance + movements = closing balance for each source.
6. Escalate unexplained or material differences under the payment-incident runbook. Retain evidence per finance and privacy policy.
