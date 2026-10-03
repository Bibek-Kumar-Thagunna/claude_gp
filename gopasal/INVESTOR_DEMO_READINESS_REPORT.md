# GoPasal Investor Demo Readiness Report

Assessment date: 9 September 2026  
Scope: local investor build in `/home/sybar/claude_gp/gopasal`

> This report is complemented by `SRS_IMPLEMENTATION_MATRIX.md`, which audits all 13 phases of the now-available GoPasal SRS v3. Statements below that previously treated the SRS or finance rules as absent are superseded by that matrix and the Phase 8 implementation.

## 1. EXECUTIVE STATUS

**PARTIALLY READY**

The investor-critical marketplace journey runs through the real API and PostgreSQL: OTP authentication, catalog/search, cart/address/coupon checkout, provider-backed payment contracts, seller fulfilment, rider delivery, customer tracking/review, seller reply, notifications, support, admin metrics/management/audit, and RBAC denial.

The SRS is now present and its Phase 8 financial rules are implemented: versioned commission snapshots, escrow, COD receivables, refunds, settlement batches and an append-only balanced ledger. Production payment/refund/payout rails still require licensed provider credentials. Customer group ordering and the dedicated rider web console are now end to end.

## 2. CUSTOMER

**PARTIAL**

Done for the core journey: real OTP login/account creation, active-shop/category/search discovery, product/variant data, persisted cart, saved addresses and favourites, coupon validation, checkout, COD and provider-ready online payment, group ordering, order history/detail, delivery tracking, persisted notifications, delivered-order review, seller reply visibility, and persisted support tickets.

The former production fixture flows and fake success transitions were removed. Search and shop/product navigation were browser-smoked with no console errors. Saved shops/products expose current availability honestly. Group ordering now includes private joining, participant baskets, server quotes and transactional placement. Native mobile apps are explicitly described as not published.

## 3. SELLER

**DONE for the investor demo**

The seller implementation is API-backed and shop-scoped across authentication, dashboards, orders, acceptance/rejection, packing, rider assignment, dispatch, delivery, catalog/products/variants/photos, inventory, promotions/coupons, reviews/replies, notifications, interactive analytics, staff/invites/roles, settings, verified onboarding, and finance/settlement visibility. The E2E verifier exercised owner fulfilment of the same customer order and seller review reply.

## 4. ADMIN

**PARTIAL**

Real surfaces include OTP authentication, live overview/interactive analytics, shop and document-review workflows, user lifecycle controls, catalog moderation, support, disputes and refund resolution, fraud operations, policies, platform coupons, versioned settings, finance/reconciliation/settlements/ledger, append-only audit, platform role CRUD/clone, staff role assignment/removal, and secure staff invitations with recipient acceptance by one-time link or scoped six-digit manual code. The E2E verifiers persisted and refetched admin management actions, proved pre-accept default deny, and proved a Support Agent receives only its assigned permission set.

The remaining gaps are later-phase depth rather than fixture-driven core screens: dedicated courier dispatch tooling, advanced campaign segmentation, richer compliance exports and production provider operations. See `SRS_IMPLEMENTATION_MATRIX.md` for the exact phase-by-phase boundary.

## 5. RBAC & SECURITY

**DONE for the investor-critical paths**

Authorization is enforced by backend guards and resource ownership, not just React. Seller permissions are shop-scoped; platform permissions are separate. The live verifier confirmed a shop manager receives 403 for an owner-only role operation and a customer receives 403 for the admin overview.

Group-order hardening is included: resource authorization, share-code privacy, item and stock bounds, server-owned checkout quotes, GoCoin parity, transactional exactly-once placement, unique `Order.groupOrderId`, and regression tests. Payment verification checks signed order association, amount, reference, terminal-state idempotency, and prevents a paid order being downgraded. DTO validation, coupon transaction behavior, stock transitions, and audit logging remain active.

## 6. OTP DEVELOPMENT PROVIDER

**DONE**

`SMS_PROVIDER=log` uses the normal random OTP generation, hashed storage, expiry, attempt limit, resend cooldown, hourly rate limit, and verification endpoints. In the explicit development environment it returns a clearly labelled development code to the login UI because no SMS leaves the machine; production and every real-provider response omit it. Optional `SMS_DEV_OUTBOX_FILE` JSONL output exists solely for local E2E automation and is rejected by production configuration. Seller and admin web inputs both match the configured six-digit OTP length.

Production refuses the log provider and requires a configured Sparrow or Twilio provider.

## 7. PAYMENT PROVIDER READINESS

**READY FOR CREDENTIALLED INTEGRATION**

Customer checkout exposes only real enabled methods. The development-only integration harness is disabled by default and cannot start in production. Checkout persists an intent and signed provider reference tied to order, exact amount, and nonce. Verification supports success, failure, and pending; terminal duplicates are idempotent; tampered amounts/references are rejected; retry creates a fresh reference; and paid state cannot be downgraded.

Production eSewa/Khalti operation remains credential-gated and must use each provider's approved initiation, callback, lookup and refund contract.

## 8. FINANCE

**DONE locally; production rails external**

The API now snapshots the configured commission per order, holds verified online funds in escrow, releases after delivery plus the configured refund window when no blocking dispute exists, accrues COD commission, batches settlement offsets, supports full/partial refund accounting and writes balanced append-only journals. Seller and admin finance pages expose real persisted values. Daily and on-demand reconciliation are supported; external bank/wallet transfer completion requires a reference.

Production eSewa/Khalti initiation/callback/refund adapters and automated payout webhooks require merchant credentials. Store credit is deliberately disabled until a legally reviewed customer wallet exists.

## 9. DELIVERY

**DONE for the demonstrated lifecycle; PARTIAL as a separate product surface**

Seller assignment, rider queue, pickup, dispatch, en-route, delivered, proof/COD collection state, rider coordinates, customer timeline, and order consistency are persisted and exercised. Redis-backed realtime adapter initialization was corrected. Customer tracking uses only verified shop, destination and rider coordinates. Configured Mapbox routing supplies road geometry; key-free mode is explicitly labelled as direct/straight-line distance, and missing pins produce an honest unavailable state.

The dedicated responsive rider web console is connected to the real rider endpoints. It provides rider-only OTP sign-in, online/offline availability, assigned jobs, full order and address snapshots, consent-based GPS sharing, device navigation handoff, pickup/en-route/delivery transitions, explicit COD collection, private proof-photo upload and paginated delivery history. Native apps, closed-browser background GPS and automated dispatch remain separate future work.

## 10. NOTIFICATIONS

**DONE for core order/payment lifecycle; PARTIAL beyond it**

The customer notification page lists persisted records and supports mark-one/mark-all read behavior. The E2E order lifecycle produced eight persisted order notifications and customer state remained consistent after delivery/payment. Seller notification behavior remains API-backed. Device push uses the honest log provider because no mobile device-token registry exists; support/onboarding notification coverage was not claimed as fully verified.

## 11. DATABASE / MIGRATIONS

**DONE locally**

Datasource was verified as PostgreSQL `gopasal` at `localhost:15432`; Redis is `localhost:6380`, and both Docker services are healthy. Eleven migrations are present and applied, including group-order exactly-once, development-payment, onboarding/location and finance-core migrations. Prisma schema validation, client generation, and migration status all pass; migration status reports the schema up to date.

No remote or production database was accessed.

## 12. SEED DATA

**DONE**

Repeatable seed logic creates 53 permissions, platform and shop roles, Super Admin/Ops/Support staff, two active and one pending shop, eight realistic categories (including Restaurant & Food and Print, Photo & Copy), products/variants/inventory, owner/manager/rider identities, three customers and addresses, `WELCOME100`, one live delivery, one delivered/reviewed order, one incoming order, policies, loyalty, and referral data. After a clean reset the coupon has zero redemptions.

## 13. E2E FLOWS VERIFIED

**PASSED**

The checked-in `scripts/verify-investor-demo-e2e.mjs` exercised:

1. Database/cache health and live catalog search/product variants.
2. New-customer OTP request/verification through the log provider, profile, saved address, cart, coupon, checkout, and persisted order.
3. COD checkout plus proof that simulated payment is absent from available methods and rejected when submitted directly.
4. Seller OTP, visibility of the same order, accept, pack, and rider assignment.
5. Rider OTP, own queue, pickup, seller dispatch, en-route, and delivered.
6. Customer delivered state, review, seller visibility/reply, and public reply visibility.
7. Customer support ticket, admin OTP, real dashboard metrics, admin reply, customer visibility, user suspend/refetch/reactivate, and audit record.
8. Manager owner-only denial (403), customer admin denial (403), eight notifications, and final delivered/paid history.

Result: `Investor-critical E2E API verification PASSED`.

Public runtime browser checks also covered the customer home/search/store, support/contact/get-app truthfulness, seller login, and admin login. The tested pages emitted no console errors. Authenticated state transitions were verified through the API E2E script rather than browser form automation.

## 14. EXACT VERIFICATION COMMANDS AND RESULTS

Run from `/home/sybar/claude_gp/gopasal`:

```bash
pnpm typecheck
# 7 successful, 7 total

pnpm lint
# 7 successful, 7 total; no warnings/errors after the final lint pass

pnpm test
# 809 tests passed, 0 failed

pnpm build
# 4 build tasks passed: API, customer, seller, admin

pnpm --filter @gopasal/api exec prisma validate
# schema valid

pnpm --filter @gopasal/api exec prisma generate
# Prisma Client generated

pnpm --filter @gopasal/api exec prisma migrate status
# 11 migrations found; database schema up to date

SMS_DEV_OUTBOX_FILE=/tmp/gopasal-sms-outbox.jsonl pnpm dev
pnpm verify:investor
# Investor-critical E2E API verification PASSED

git diff --check
# clean
```

The final rerun timestamps and any deviation from these recorded results should be checked before presenting.

## 15. KNOWN DEMO LIMITATIONS

- SRS Phases 9–13 retain partial or unimplemented items; see `SRS_IMPLEMENTATION_MATRIX.md`.
- Production gateway refunds and bank/wallet payouts require external credentials and callbacks.
- Rider GPS from the web console runs while that page remains open; true closed-app background tracking requires the future native rider app.
- Native Android/iOS apps are not published.
- Public OSM/map style tiles may require internet; state/timeline still works without tiles.
- eSewa/Khalti production controls are intentionally absent until their signed initiation, callback, lookup and refund adapters have approved merchant credentials.
- Email links identify a support address, but the application itself does not send email.

## 16. PRODUCTION-ONLY INTEGRATIONS STILL REQUIRED

- Production SMS delivery and credentials (Sparrow or Twilio).
- Proper eSewa/Khalti sandbox and production protocol adapters with credentials/webhooks.
- Production object storage/CDN configuration; the S3 path can be exercised locally with MinIO.
- Mapbox credentials (or an approved equivalent provider) and a production map style to activate road routing and reverse geocoding; the adapter and fail-closed configuration are already implemented.
- Mobile device registration plus FCM/APNs push delivery.
- Production payout provider and tax/withholding treatment after finance/legal approval.
- Production observability/error monitoring and deployment infrastructure.

Production startup fails closed for development OTP/payment settings and missing required provider credentials rather than silently falling back.

## 17. FILES CHANGED

The working tree intentionally includes the previously authored group-order hardening plus this investor-readiness phase. Main groups:

- API configuration/providers: `.env.example`, config validation/tests, payment provider/tests, realtime gateway.
- Database/order engine: Prisma schema, group-order migration/service/controllers/tests, production payment validation/providers, order DTO/controller/service, coupon transaction handling.
- Customer web: real API client, auth, shop/catalog/search, cart/address/checkout/payment, orders/tracking, notifications, reviews, support, truthful contact/mobile copy, and offline-safe local fonts.
- Admin web: real API client and guarded workflows for dashboard, analytics, shops/KYC review, users, catalog, disputes/refunds, fraud, support, policies, coupons, finance, settings, audit, RBAC and staff invitations.
- Seller web: guarded shop operations, onboarding/location capture, staff invitations/RBAC, interactive analytics, coupons and finance/settlement visibility.
- Local operations: all three `.env.development` files, `turbo.json` environment passthrough, Docker documentation, root `verify:investor` command, lockfile, and `scripts/verify-investor-demo-e2e.mjs`.
- Handoff documents: `INVESTOR_DEMO_GUIDE.md` and this report.

Use `git status --short`, `git diff --stat`, and `git diff --name-only` for the exact current file list. No commit was created.

## 18. HOW TO RUN TOMORROW'S DEMO

Follow `INVESTOR_DEMO_GUIDE.md`. In short:

```bash
cd /home/sybar/claude_gp/gopasal
pnpm db:up
pnpm --filter @gopasal/api exec prisma migrate status
pnpm db:reset
SMS_DEV_OUTBOX_FILE=/tmp/gopasal-sms-outbox.jsonl pnpm dev
```

Open customer `:3000`, seller `:3001`, and admin `:3002`. Enter each clearly labelled six-digit development OTP (the API terminal also records it). Demonstrate one customer COD order, process that same order through rider assignment and delivery, return for review/reply, then show real seller/admin analytics, COD settlement, coupons, disputes/refunds, user lifecycle, audit, roles, staff invitations, and RBAC. State the provider boundary explicitly: finance accounting is real, while SMS delivery, eSewa/Khalti transactions and external payouts require approved credentials.
