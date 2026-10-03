# GoPasal Investor Demo Guide

This is the reliable 10–15 minute local walkthrough for the investor build dated 8 September 2026. The customer, seller, and admin applications all use the same API and PostgreSQL database.

> External SMS and payment delivery is running through local development providers; the platform integration, authorization, validation, state machines, and database transitions are real. These providers are not production Sparrow/Twilio, eSewa, or Khalti integrations.

## Start from a deterministic local state

Prerequisites: Node.js 20+, pnpm 9+, Docker with Compose, and ports 3000–3002, 4000, 15432, and 6380 available.

```bash
cd /home/sybar/claude_gp/gopasal
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
pnpm db:up
pnpm db:probe
pnpm --filter @gopasal/api prisma:deploy
pnpm db:seed
SMS_DEV_OUTBOX_FILE=/tmp/gopasal-sms-outbox.jsonl pnpm dev
```

`pnpm db:seed` is designed to be repeatable. For the cleanest rehearsal, use the authorized local-only reset below only after confirming Prisma reports `localhost:15432/gopasal`:

```bash
pnpm --filter @gopasal/api exec prisma migrate status
pnpm db:reset
```

Do not run `db:reset` against an unknown or remote datasource.

Wait until the four processes report ready, then open:

- Customer: http://localhost:3000
- Seller: http://localhost:3001
- Admin: http://localhost:3002
- API health: http://localhost:4000/api/health
- API documentation (development only): http://localhost:4000/api/docs

## Demo identities

All identities authenticate through the normal OTP request and verification endpoints. There are no login bypasses or universal codes.

- Customer — Rina Shakya: `9840000001`
- Shop owner — Bibek Shrestha, Namaste Kirana: `9811111111`
- Shop manager — Sita Rai: `9811111112`
- Rider — Hari Tamang: `9811111120`
- Super Admin: `9800000001`
- Operations Admin: `9800000002`
- Support Agent: `9800000003`

After clicking **Send code**, the seller and admin login screens show a clearly labelled **Development OTP** because the local `log` transport cannot deliver an SMS. The same six-digit code appears in the API terminal in an `SMS (development transport — NOT delivered)` block. When the optional outbox above is enabled, the message is also appended to `/tmp/gopasal-sms-outbox.jsonl` for automation. This helper is emitted only by the explicit `development + SMS_PROVIDER=log` combination; production and real-gateway responses never contain it. The OTP still expires, is hashed in storage, observes retry/rate limits, and must be verified by the normal API.

Staff invitations support both a one-time link and a six-digit manual code. Shop recipients can enter a code at `http://localhost:3001/join`; platform recipients use `http://localhost:3002/join`. Acceptance always requires an OTP-verified session on the exact invited phone number, and each console scopes code acceptance to its own role type.

## Before the investor joins

1. Reset and seed the local database, then start the full stack.
2. Open one private/incognito window per role so tokens do not overwrite one another.
3. Keep the API terminal visible if you want to demonstrate that local OTP delivery is honest and non-delivering; the login UI also shows the development code.
4. Confirm all four URLs load and the health endpoint reports database and cache as healthy.
5. Keep the new order code visible after customer checkout; use that same code throughout the seller and customer steps.
6. The public map tiles need network access. If tiles are unavailable, the persisted delivery state and rider coordinates remain visible without them.

## Exact 10–15 minute walkthrough

### 1. Customer login and live marketplace (about 2 minutes)

1. Open `http://localhost:3000/login`.
2. Enter `9840000001`, click **Send secure code**, enter the clearly labelled six-digit development code, and verify it.
3. Open **Shops**. Search for `Namaste` and open **Namaste Kirana Pasal**.
4. Point out that shop status, hours, verified contact, products, variants, prices, and stock are API-backed. Open **Basmati Rice** and select a variant.
5. Add enough goods to exceed रु 500; for example, three 1 kg Basmati Rice units.

### 2. Persisted checkout and COD settlement (about 2 minutes)

6. Open the cart and choose Rina's seeded **Home** address.
7. Choose the visible `WELCOME100` offer card (or enter the code), review the savings in the order summary, select **Cash on delivery**, and place the order. The coupon has no seeded redemptions after a clean reset.
8. Record the displayed `GP-…` order code. The API has already validated price, inventory, address, delivery coverage, coupon rules and payment eligibility, then persisted the order and payment intent.
9. Explain that eSewa and Khalti appear only when their real vendor credentials are configured. There is no simulated-success payment method.

### 3. Seller fulfils the same order (about 3 minutes)

11. In the seller window, sign in at `http://localhost:3001/login` with owner `9811111111` and the six-digit development OTP.
12. Select **Namaste Kirana Pasal**, open **Orders**, and locate the customer order by its exact `GP-…` code.
13. Click **Accept order**, then **Mark packed**. Refetches show the server-owned state and timeline.
14. In the order's **Delivery** panel, assign **Hari Tamang**, then click **Hand to rider** / **Send out**.
15. Advance the delivery using the available next-step control until **Handed over** appears. Confirm handover. For an online-paid order there is no COD collection checkbox; for COD the server derives the collection amount from the order total.
16. Briefly open **Analytics** to show the interactive revenue/order chart, then open **Finance** to show the persisted COD cash and commission position. Note that inventory and finance were updated by the order transaction rather than browser state.

### 4. Customer tracking, notification, and review (about 2 minutes)

17. Return to the customer window and open **Orders**, then the same `GP-…` order. Show the full persisted event timeline and delivered status.
18. Open **Notifications** to show database-backed lifecycle notifications.
19. On the delivered order, submit a rating and short review. The API permits one review only for that customer's delivered order.

### 5. Seller reply (about 1 minute)

20. Return to the seller console and open **Reviews**.
21. Find the new review and reply. Return to the customer order/shop view to show the persisted seller reply.

### 6. Admin operations and auditability (about 2–3 minutes)

22. Sign in at `http://localhost:3002/login` with Super Admin `9800000001` and the six-digit development OTP.
23. Open **Dashboard** and show real platform, shop, customer, order, and 30-day GMV metrics.
24. Open **Shops** to show the two active shops and pending **Fresh Valley Veggies** onboarding record. Lifecycle actions use the admin API and are audited.
25. Open **Users**, suspend Rina, refetch to show persistence, then reactivate her so the demo seed remains usable.
26. Open **Audit log** and show the recorded admin actions.
27. Open **Support**. From the customer window, create a ticket first if the list is empty; then reply and close it as admin and show the same response in the customer help centre.
28. Open **Finance**. Show the platform escrow/COD position, settlement batches and balanced ledger, then run reconciliation. A payout/collection cannot be marked complete without a real external transfer reference.
29. Open **Coupons** to show platform-funded coupon administration, then **Disputes** to show the refund-and-resolve control for an eligible paid order.

### 7. RBAC proof and honest boundaries (about 1 minute)

30. Sign in to a separate seller window as manager `9811111112`. Show that owner-only role-management actions are absent/denied; the API independently returns 403 for the owner-only role mutation tested by the E2E verifier.
31. State the external boundary accurately: the local OTP transport does not send SMS, and online gateways remain unavailable without credentials. Production Sparrow/Twilio, eSewa/Khalti and bank/wallet payouts require approved credentials and callbacks.

## Optional automated rehearsal

With the clean stack already running using `SMS_DEV_OUTBOX_FILE`, run:

```bash
pnpm verify:investor
```

This exercises authenticated customer, seller, rider, and admin API flows against PostgreSQL. It creates disposable records and changes order/user state, so reset/reseed after it before the live demo:

```bash
pnpm db:reset
```

## Shutdown

Stop `pnpm dev` with Ctrl+C. Keep the local database for rehearsal, or stop its containers with:

```bash
pnpm db:down
```
