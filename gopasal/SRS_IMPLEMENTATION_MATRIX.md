# GoPasal SRS v3 Implementation Matrix

Assessment date: 26 September 2026  
Source: `../GoPasal SRS v3 - Ultra Detailed.pdf` (86 pages)  
Scope: the API, customer web, seller web, admin web, rider web, database migrations, seed, deployment manifests and automated release checks.

## Status definitions

- **Applied** — implemented against persisted API/database state and available locally.
- **Partial** — a safe core exists, but one or more SRS subflows or dedicated user surfaces remain.
- **External integration** — the platform contract/local provider exists; production operation needs a vendor account, credential, legal approval or infrastructure.
- **Not applied** — no complete implementation is represented in the product.

## Executive result

The local product now covers the core transactional marketplace across customer, seller and admin: OTP identity, seller onboarding and document review, shop discovery, catalog/inventory, cart/checkout, coupons, optional COD/online payment, fulfilment, delivery tracking, disputes/refunds, escrow, commission, settlement batches, append-only double-entry journals, notifications, analytics, RBAC and audit.

Production SMS, production eSewa/Khalti, automatic bank/wallet payout execution, device push, app-store mobile apps and production infrastructure remain external. Later growth/enterprise features in SRS Phases 11–13 are intentionally only partial.

## Phase 1 — Platform foundation

**Applied**

- Environment-specific configuration with startup validation and fail-closed production rules.
- Versioned platform commission/delivery/COD/refund-window configuration.
- Versioned global/shop feature flags.
- Multi-tenant shops, lifecycle states and tenant-scoped reads/writes.
- Customer, seller, rider and platform role foundations.
- Structured audit records for privileged mutations.
- Repository-root CI gates for lint, types, tests, migrations, the real HTTP lifecycle,
  seller/admin RBAC boundaries, dependency advisories and all five production images.
- Hardened non-root production containers, dependency-aware API readiness probes,
  default-deny network policy templates and ordered migration/deployment runbooks.
- All four Next.js surfaces ship as lean standalone images (about 282–288 MB in the
  verified build), start with a read-only root filesystem, and use bounded ephemeral
  cache mounts for safe runtime image optimization.
- Production dependency audit currently reports no known advisories at moderate severity or above.
- Node.js 22 LTS is pinned for CI and every production image; builds no longer depend on the
  end-of-life Node.js 20 line.
- The API publishes Prometheus process, bounded route-template HTTP, dependency, notification
  queue and aggregate business-state metrics on a separate internal-only listener. Kubernetes
  scrape annotations, namespace-restricted network access and actionable alert rules are included.

**Partial / external**

- The deployment/alert/backup/restore contracts and runbooks exist, but the real cluster,
  Prometheus/telemetry backend, alert routing, backup destination and disaster-recovery drill
  require production infrastructure.

## Phase 2 — Customer platform

**Applied**

- OTP registration/login, session refresh/revocation and account profile.
- Saved delivery addresses with debounced Nepal place search, GPS/manual fallback, exact-gate map adjustment, reusable coordinates and default selection.
- Category/shop discovery, search, verified-shop eligibility and product/variant browsing.
- Persisted single-shop cart, stock checks, minimum order and serviceability.
- Checkout with server-owned pricing, delivery fee, coupon validation and payment eligibility.
- Customer-selectable COD or enabled online method.
- Order history/detail, event timeline, authenticated Socket.IO rider position on a MapLibre route map, polling fallback and notifications.
- Private customer-to-shop messaging with a pre-order customer initiation rule and order-linked conversations.
- Reviews/replies, support tickets and disputes.
- Visually discoverable checkout offers with one-click application and server quote.
- Source-grounded support assistant with persistent conversations, approved knowledge citations, safe refusal and one-click human handoff with the transcript attached.
- Account-persisted saved shops and products with idempotent controls, cross-user isolation, pagination and honest current-availability states.
- Production group ordering: host creation, private share links/codes, authenticated joining, per-person baskets, live room refresh, early variant/stock validation, host lock, server-owned combined quote, coupons, GoCoins, payment selection and exactly-once placement.

**Partial**

- Native Android/iOS apps are not published; the responsive customer web is the local surface.
- Production Nepal map tiles, location search/place resolution, reverse geocoding and bike-route geometry activate through the Baato adapter using separate server and origin-restricted browser tokens. Google Maps/Places is an optional address-picker-only surface with its own restricted browser key; Google search content is not drawn on Baato. Google requires a billing-enabled project and quotas, so this is not guaranteed free or card-free. The key-free OSM mode remains explicitly straight-line/degraded.

## Phase 3 — Seller and staff platform

**Applied**

- Professional seller registration with resumable application state.
- Nepal-focused mandatory verification: owner citizenship, business registration, PAN, physical shop photo and category/regulatory documents where applicable; bank proof is conditional for bank payout.
- Admin document preview, per-document verify/reject, application review, approval/rejection and reasoned resubmission.
- Shop profile, availability, hours, service radius and minimum order.
- Optional-at-registration verified shop location using phone capture/QR handoff; storefront remains hidden until location and an active deliverable product exist.
- Product, variant, image, inventory and stock management.
- Cancellation/rejection returns every checkout-reserved product or variant quantity exactly once, even when requests race.
- Order acceptance/rejection, packing, rider assignment, dispatch and delivery.
- Staff invitations with OTP-verified recipient acceptance, expiring one-time link/manual six-digit code, resend/revoke and scoped role assignment.
- A permission-scoped shop inbox: staff may reply to customer-started pre-order threads, while shop-initiated contact is allowed only for the shop's real orders.
- Shop RBAC, owner lockout protection and cross-shop isolation.
- Promotions, reviews/replies, notifications, analytics and finance/settlement visibility.

**Partial / external**

- Business-document requirements are policy-driven, not a substitute for Nepal legal counsel or government-registry verification APIs.
- Updating an approved payout destination requires a controlled admin/onboarding change workflow rather than an unrestricted seller edit.

## Phase 4 — Delivery platform

**Applied**

- Seller self-delivery and assigned-rider data models.
- Delivery task lifecycle, rider assignment, pickup/en-route/delivered states and customer timeline.
- Atomic rider and delivery claiming: offline/busy riders cannot be assigned, concurrent dispatch conflicts safely, and eligible failed/returned attempts can be reassigned with the prior reason preserved in timeline and audit history.
- Proof/COD fields, rider GPS updates, order/delivery state consistency and notifications.
- COD collection becomes a seller-side cash position with GoPasal commission due in settlement.
- Dedicated mobile-first rider web console with rider-only OTP sign-in, availability, assigned delivery queue, immutable pickup/destination/order details, consent-based GPS sharing, pickup/en-route/handover transitions, cash confirmation and paginated delivery history.
- Private proof-of-delivery photo upload with content sniffing, bounded multipart input, cross-rider ownership enforcement, factual handover notes and no storage-key disclosure to the browser.
- Authenticated proof review for the owning customer, scoped seller staff, assigned rider and dispute-authorized platform staff; reads are non-cacheable, revalidate stored bytes and are audit logged.
- Production delivery-exception custody: a pre-pickup failure releases the rider, while a post-pickup failure keeps the rider occupied until they return the parcel and the shop records its physical condition. Only then can the shop redeliver or the customer/shop cancel, restore stock/coupon/GoCoins, and queue a paid refund.
- Dedicated seller return queue, rider return-to-shop guidance, customer exception status and notifications, complete delivery-transition audit, and customer location privacy once the rider is no longer travelling toward the customer.

**Partial**

- Native rider Android/iOS apps and background GPS while the web console is closed are not complete; the responsive rider web console works while open.
- Automated dispatch optimization and embedded turn-by-turn navigation remain incomplete. The rider console opens the correct verified customer or shop-return pin in the device navigation app.

## Phase 5 — Super Admin and governance

**Applied**

- Platform OTP login, platform roles, staff invitations and default-deny permission guards.
- Dashboard, shop lifecycle, full application/document review and reasoned resubmission.
- User suspension/reactivation, product moderation, fraud flags and enforcement records.
- Support and dispute evidence review.
- Refund-and-resolve action for paid customer-favour disputes.
- Platform analytics with interactive GMV/order chart and CSV export.
- Policy version management, audit log, platform configuration and feature flags.
- Platform coupon administration.
- Finance overview, reconciliation, settlement transfer references and balanced ledger inspection.

**Partial**

- Government registry cross-checks and automated fraud decisioning are not connected.
- Legal approval remains a human governance responsibility.

## Phase 6 — UX, design system and accessibility

**Applied**

- Shared brand tokens/primitives, responsive layouts, loading/error/empty states and confirmation for sensitive actions.
- Keyboard-labelled forms and dialogs, default focus handling, explicit permission-denied states and reduced-motion-aware components.
- Invitation form uses a right-side task drawer; the one-time-secret result uses a correctly centred, viewport-safe modal.
- Checkout presents payment and coupon choices as clear cards with eligibility/help text.
- Offline detection and graceful map/state fallback.

**Partial**

- English/Nepali content exists but full professional translation coverage is incomplete.
- A formal WCAG audit with screen-reader/device lab evidence has not been completed.
- Rich offline mutation queues are not implemented.

## Phase 7 — Backend architecture, authentication and RBAC

**Applied**

- Modular NestJS API, PostgreSQL/Prisma, Redis, Socket.IO and shared API client.
- DTO allow-list validation, throttling, ownership checks and audit interceptors.
- Random six-digit OTP, hashed challenge storage, expiry, resend/rate/attempt limits and real-provider abstraction.
- Refresh sessions, surface/device metadata and revocation.
- Platform/shop scopes, permission catalogue, guards, role templates/custom roles and invitation acceptance.
- Group-order backend authorization and exactly-once transactional placement.

**External integration**

- SMS delivery needs Sparrow or Twilio credentials; local log OTP remains fully verifiable without pretending a message was delivered.

## Phase 8 — Payments, escrow, settlements and refunds

**Applied**

- Shop/deployment-filtered COD and online payment methods.
- COD works without external credentials. eSewa ePay v2 and Khalti KPG-2 use their real initiation, server verification, amount/reference binding, retry and terminal-idempotency paths when vendor credentials are configured.
- Simulated payment initiation/completion routes are removed; checkout accepts only COD, eSewa and Khalti, including when the API is called directly.
- Online payment capture into escrow.
- Escrow release only after delivery, configured refund window and no unresolved/customer-favour dispute.
- Commission snapshot per order so later rate changes do not rewrite history.
- COD commission receivable when cash is collected by the delivery/seller side.
- Daily reconciliation plus an admin on-demand reconciliation action.
- Settlement batches offset online seller payable against COD commission receivable.
- Bank/wallet destination is inherited from the verified onboarding application and masked in settlement output.
- Admin transfer completion requires a bank/wallet reference; sellers can inspect batches and references.
- Full/partial refunds with order status, escrow/commission reversal and original-source/manual-COD rules.
- Customer and seller cancellation reasons are required; the winning terminal transition atomically restores inventory, releases an assigned rider, returns coupon/GoCoins and prevents late gateway capture.
- A paid cancellation automatically reserves the remaining full refund. Customers see its live state and platform finance has an RBAC-protected operations queue that requires a real gateway/bank/wallet reference to complete it.
- Khalti full wallet refunds use the vendor lookup and refund endpoints, bind the exact original amount and transaction ID, recognise an already-refunded transaction, and use atomic claims, stale-attempt recovery and bounded retry backoff. An authorized operator can also trigger an immediate attempt.
- Full refunds also reverse any GoPasal-funded coupon or GoCoin subsidy, including after an earlier partial refund, so escrow, seller payable and promotion ledgers close cleanly.
- Append-only finance journals protected by database triggers and balanced ledger entries.

**External integration / intentionally not claimed**

- eSewa and Khalti production initiation/callback adapters require merchant credentials and sandbox onboarding.
- eSewa refunds, partial gateway refunds and Khalti banking-rail refunds whose vendor request needs a separately verified payer mobile remain in the safely reconciled operations queue; finance executes those in the merchant dashboard and records the genuine reference.
- Real automated bank/wallet disbursement and confirmation webhooks are not connected; local admin records the externally completed reference.
- Store-credit refunds are disabled because no regulated customer cash wallet exists.
- Hybrid split-tender payment is not implemented.
- Tax invoice/withholding accounting needs finance/legal sign-off.

## Phase 9 — Data privacy, retention and compliance

**Applied**

- Private KYC object namespace, authenticated document streaming and no public KYC URLs.
- Upload malware screening is fail-closed in staging/production through a private ClamAV service; scanner readiness is included in health checks and local integration tests exercise the real protocol.
- The S3-compatible storage policy exposes only `public/` product assets, resets bucket-root access to private, denies anonymous listing/private reads, and is verified against live MinIO in CI.
- Tenant/platform access control, response sanitization and audit history.
- Published privacy/terms/refund/delivery documents and profile correction controls.
- Authenticated self-service JSON data export covering profile, addresses, orders, messages,
  support history, engagement data and seller applications while excluding session hashes,
  storage keys, payment-provider payloads and internal review notes.
- Purpose-bound OTP account deletion with live operational blockers for orders, refunds,
  disputes, support cases, subscriptions, group orders and seller/platform/rider duties.
- Transactional session erasure, personal-identifier anonymization and erasure of disposable
  customer data while preserving completed commerce, finance, policy and audit records.
- Purpose-bound OTP and session metadata are erased at account deletion rather than retained as
  orphaned phone/IP records.
- Administrator retention policy and legal-hold controls, an hourly bounded expiry worker,
  retention run history and transaction-snapshot redaction. Delivery-proof object cleanup is
  resumable after a storage outage and active holds do not starve other due requests.
- Account deletion transactionally queues owned KYC objects from disposable seller applications
  before removing their database rows. Hourly/manual processing retries file removal, honors
  legal holds and exposes pending/failure counts to compliance staff.
- A read-only local/S3 private-evidence inventory classifies linked, queued, recent, held and
  untracked KYC objects, plus legacy support references, into a restricted report. New support
  replies reject unowned attachment strings.

**Partial / not applied**

- Legal retention durations, exemptions and evidence-preservation rules still require Nepal
  counsel sign-off. Legacy ticket attachment strings lack verified object ownership, so expiry
  clears their database references but cannot safely delete arbitrary referenced objects.
- The inventory must be run and reviewed against the real deployment. Unknown-owner legacy
  KYC objects and old support references cannot be safely removed automatically; preservation,
  ownership and a documented remediation decision require compliance review.
- Production encryption/key management, backup retention and incident tooling require infrastructure.

## Phase 10 — Legal safety, terms, liability and enforcement

**Applied**

- Versioned policy documents and customer-facing legal pages.
- Seller evidence review, fraud flags, suspension/reactivation and reasoned application enforcement.
- Support/dispute records and auditable decisions.

**Partial / external**

- Final Nepal marketplace, consumer, tax, privacy, escrow and delivery-partner wording requires licensed Nepal counsel.
- Government notices, formal appeal SLA automation and regulatory reporting are not complete.

## Phase 11 — Growth, monetization and advanced intelligence

**Applied / partial**

- Shop and platform fixed/percentage coupons, minimums, caps, dates, global/per-user limits, redemption and customer discovery.
- Referral and loyalty data foundations exist.
- Subscription record foundations exist, but Gold self-enrollment now fails closed until payment-backed billing and renewals exist; the former free-activation endpoint was unsafe for production.
- Customer support assistant with source-grounded approved knowledge and a key-gated OpenAI Responses API provider; human staff retain all account, refund and money decisions.

**Not applied**

- Paid placements/ad auction, AI logistics batching, seller/admin copilots, telecom-number masking, mature VAT automation and advanced campaign attribution.

## Phase 12 — Modern experience layer

**Applied / partial**

- GoPasal Gold/subscription foundations and an end-to-end group-order experience.
- Responsive modern web, rich order tracking and improved checkout offer experience.

**Not applied**

- Semantic/voice search, video stories and smart reorder recommendations.

## Phase 13 — Enterprise scale, gamification and high velocity

**Partial**

- Loyalty points/tier foundation and transactional stock protection exist.

**Not applied**

- Master-merchant hierarchy, enterprise consolidated controls, flash-sale queueing/virtual waiting room, mature tier rewards and EV/sustainability routing.

## Applied beyond explicit SRS requirements

- Honest local OTP code presentation and optional JSONL outbox for deterministic automation, guarded from production.
- Production payment ingress that refuses retired/simulated methods even when submitted directly.
- Phone/QR shop-location handoff with expiry, accuracy requirement and storefront readiness gate.
- Secure one-time staff invitation link plus manual six-digit recovery path.
- Private customer-shop messaging with retry idempotency, unread state, notifications, realtime event rooms and strict order/shop ownership checks.
- Database-level append-only finance protection, not only application conventions.
- Seeded, customer-visible `Namaste Kirana Pasal` seller plus cross-role E2E verification scripts.
- Explicit feature-boundary screens where a production integration is unavailable instead of fabricated success data.

## Local demo identities

- Customer: `9840000001`
- Customer-visible shop owner (Namaste Kirana): `9811111111`
- Shop manager: `9811111112`
- Rider: `9811111120`
- Super Admin: `9800000001`
- Operations Admin: `9800000002`
- Support Agent: `9800000003`

All use the normal OTP flow. With the local log SMS provider, the generated six-digit development code is shown explicitly and remains subject to expiry, rate and attempt limits.

## Production credential plan

- **Can be evaluated without card details:** eSewa's official ePay documentation publishes UAT endpoints and test credentials. Merchant production onboarding is still required.
- **Likely account onboarding required:** Khalti publishes sandbox/test guidance, but merchant credentials are required for real server-side initiation and lookup.
- **No payment credential needed before onboarding:** COD exercises the complete order, delivery, cash-position and settlement flow. Online payment is intentionally unavailable until eSewa/Khalti credentials are supplied; there is no simulated-success gateway.

The Nepal Rastra Bank Payment Systems Department regulates and licenses payment service providers/operators. GoPasal should integrate licensed rails and obtain legal/accounting review rather than represent its own unlicensed stored-value wallet.
