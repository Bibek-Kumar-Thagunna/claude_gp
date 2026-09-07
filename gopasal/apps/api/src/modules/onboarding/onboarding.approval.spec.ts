import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type ApplicationStatus, type DocumentReviewState, type PayoutMethod, type ShopDocumentKind } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { ShopsService } from '../catalog/shops.service';
import type { PolicyService } from '../policy/policy.service';
import { EVENTS, type ApplicationApprovedEvent } from '../../common/events';
import { OnboardingService } from './onboarding.service';

/**
 * Focused tests for the approval transaction — the one place in onboarding where
 * a mistake is expensive: a duplicated shop, a lost Owner membership, or an
 * internal note leaking into an applicant-facing payload.
 *
 * These run against an in-memory stand-in for Prisma rather than the real
 * database, so what is verified here is the *control flow*: the claim predicate,
 * the idempotent short-circuit, the lost-claim settlement, the narrowly-scoped
 * slug retry, and what the emitted event carries. Real multi-statement atomicity
 * is a property of PostgreSQL and is NOT asserted here; the stand-in only
 * imitates rollback by restoring a snapshot when the callback throws, which is
 * enough to prove the code does not commit half an approval on the retry path.
 *
 * The real `ShopsService.provisionApprovedShop` is used (it is given the fake
 * transaction client), so shop creation and the Owner-membership upsert are
 * exercised as written rather than stubbed away.
 */

// ── the slice of each table the approval path actually touches ────────────────

interface AppRecord {
  id: string;
  reference: string;
  applicantId: string;
  status: ApplicationStatus;
  shopId: string | null;
  shopName: string | null;
  shopNameNp: string | null;
  description: string | null;
  categoryId: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  area: string | null;
  fullAddress: string | null;
  lat: number | null;
  lng: number | null;
  deliveryRadiusKm: number;
  hours: string | null;
  soloMode: boolean;
  ownerName: string | null;
  ownerNameNp: string | null;
  citizenshipNo: string | null;
  registrationNo: string | null;
  panNo: string | null;
  vatNo: string | null;
  payoutMethod: PayoutMethod | null;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  walletNumber: string | null;
  acceptedTermsAt: Date | null;
  acceptedTermsVersion: string | null;
  submittedAt: Date | null;
  submitCount: number;
  reviewedAt: Date | null;
  reviewedById: string | null;
  decisionNote: string | null;
  reviewerNote: string | null;
  changesRequested: null;
  createdAt: Date;
  updatedAt: Date;
}

interface EventRecord {
  id: string;
  applicationId: string;
  type: string;
  message: string | null;
  meta: Prisma.JsonValue | null;
  actorId: string | null;
  createdAt: Date;
}

interface ShopRecord {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  status: string;
  verified: boolean;
  categoryId: string | null;
  deliveryRadiusKm: number;
  soloMode: boolean;
}

interface MembershipRecord {
  userId: string;
  shopId: string;
  roleId: string;
  status: string;
}

/**
 * An attached KYC document, as the approval path sees it. `storageKey` is carried
 * even though nothing in approval reads it, precisely so a test can assert that
 * it never reaches a response.
 */
interface DocRecord {
  id: string;
  applicationId: string;
  kind: ShopDocumentKind;
  storageKey: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  review: DocumentReviewState;
  reviewNote: string | null;
  createdAt: Date;
}

/** Mutable, rolled back when a fake transaction callback throws. */
interface State {
  applications: AppRecord[];
  events: EventRecord[];
  shops: ShopRecord[];
  memberships: MembershipRecord[];
  documents: DocRecord[];
}

/** Outside the rollback boundary, exactly like another session's committed work. */
interface World {
  takenSlugs: Set<string>;
  categories: string[];
  provisionAttempts: number;
  transactions: number;
  /** Runs at the top of every `shopApplication.updateMany`, to race the claim. */
  beforeClaim?: () => void;
  /** Returns an error for `shop.create` to throw, imitating a concurrent insert. */
  shopCreateTrap?: (slug: string) => Error | null;
  /** Same, for the Owner-membership upsert. */
  membershipTrap?: () => Error | null;
}

function uniqueError(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

// ── argument shapes, written to match exactly what the service passes ─────────

interface ById {
  where: { id: string };
}
interface BySlug {
  where: { slug: string };
}
interface ClaimArgs {
  where: { id: string; status?: { in: ApplicationStatus[] }; shopId?: null };
  data: {
    status?: ApplicationStatus;
    reviewedAt?: Date;
    reviewedById?: string;
    decisionNote?: string;
    reviewerNote?: string;
  };
}
interface BackLinkArgs {
  where: { id: string };
  data: { shopId?: string };
}
interface EventCreateArgs {
  data: {
    applicationId: string;
    type: string;
    message?: string;
    meta?: Prisma.InputJsonValue;
    actorId?: string;
  };
}
interface ShopCreateArgs {
  data: {
    slug: string;
    name: string;
    ownerId: string;
    categoryId?: string;
    deliveryRadiusKm?: number;
    soloMode?: boolean;
    status: string;
    verified: boolean;
  };
}
interface MembershipUpsertArgs {
  where: { userId_shopId: { userId: string; shopId: string } };
  create: { userId: string; shopId: string; roleId: string; status: string };
  update: { roleId: string; status: string };
}

let seq = 0;
const nextId = (prefix: string): string => `${prefix}_${++seq}`;

/**
 * An in-memory Prisma stand-in. Only the delegates the approval path uses exist,
 * which is deliberate: if the service starts touching another table, the test
 * fails loudly instead of silently passing against a permissive mock.
 */
class FakeDb {
  constructor(
    private readonly state: State,
    private readonly world: World,
  ) {}

  private row(id: string): AppRecord | undefined {
    return this.state.applications.find((a) => a.id === id);
  }

  /** Every `findUnique` on an application returns the row plus its relations. */
  private hydrate(row: AppRecord) {
    return {
      ...row,
      applicant: {
        id: row.applicantId,
        name: 'Sita Sharma',
        phone: '9800000000',
        email: null,
        createdAt: row.createdAt,
      },
      reviewedBy: row.reviewedById ? { id: row.reviewedById, name: 'Reviewer Ram' } : null,
      category: row.categoryId ? { id: row.categoryId, name: 'Kirana' } : null,
      shop: row.shopId ? (this.state.shops.find((s) => s.id === row.shopId) ?? null) : null,
      documents: this.state.documents.filter((d) => d.applicationId === row.id),
      events: this.state.events.filter((e) => e.applicationId === row.id),
    };
  }

  readonly shopApplication = {
    findUnique: (args: ById) => {
      const row = this.row(args.where.id);
      return Promise.resolve(row ? this.hydrate(row) : null);
    },

    updateMany: (args: ClaimArgs) => {
      // The hook lets a test commit somebody else's decision in the instant
      // between the preflight read and the claim.
      this.world.beforeClaim?.();
      const row = this.row(args.where.id);
      const statusOk = args.where.status ? row && args.where.status.in.includes(row.status) : true;
      const shopOk = args.where.shopId === null ? row?.shopId === null : true;
      if (!row || !statusOk || !shopOk) return Promise.resolve({ count: 0 });
      Object.assign(row, args.data, { updatedAt: new Date() });
      return Promise.resolve({ count: 1 });
    },

    update: (args: BackLinkArgs) => {
      const row = this.row(args.where.id);
      if (!row) return Promise.reject(new Error('record not found'));
      Object.assign(row, args.data, { updatedAt: new Date() });
      return Promise.resolve(this.hydrate(row));
    },

    findUniqueOrThrow: (args: ById) => {
      const row = this.row(args.where.id);
      return row ? Promise.resolve(this.hydrate(row)) : Promise.reject(new Error('not found'));
    },
  };

  readonly shopApplicationEvent = {
    create: (args: EventCreateArgs) => {
      const record: EventRecord = {
        id: nextId('evt'),
        applicationId: args.data.applicationId,
        type: args.data.type,
        message: args.data.message ?? null,
        meta: (args.data.meta ?? null) as Prisma.JsonValue,
        actorId: args.data.actorId ?? null,
        createdAt: new Date(),
      };
      this.state.events.push(record);
      return Promise.resolve(record);
    },
  };

  readonly shop = {
    create: (args: ShopCreateArgs) => {
      this.world.provisionAttempts += 1;
      const trap = this.world.shopCreateTrap?.(args.data.slug);
      if (trap) return Promise.reject(trap);
      if (this.world.takenSlugs.has(args.data.slug)) return Promise.reject(uniqueError(['slug']));
      const record: ShopRecord = {
        id: nextId('shop'),
        slug: args.data.slug,
        name: args.data.name,
        ownerId: args.data.ownerId,
        status: args.data.status,
        verified: args.data.verified,
        categoryId: args.data.categoryId ?? null,
        deliveryRadiusKm: args.data.deliveryRadiusKm ?? 3,
        soloMode: args.data.soloMode ?? false,
      };
      this.world.takenSlugs.add(record.slug);
      this.state.shops.push(record);
      return Promise.resolve(record);
    },

    // Used only by `uniqueSlug`, which asks "is this slug already in use?".
    findUnique: (args: BySlug) =>
      Promise.resolve(this.world.takenSlugs.has(args.where.slug) ? { id: 'existing' } : null),
  };

  readonly shopMembership = {
    upsert: (args: MembershipUpsertArgs) => {
      const trap = this.world.membershipTrap?.();
      if (trap) return Promise.reject(trap);
      const key = args.where.userId_shopId;
      const existing = this.state.memberships.find(
        (m) => m.userId === key.userId && m.shopId === key.shopId,
      );
      if (existing) {
        Object.assign(existing, args.update);
        return Promise.resolve(existing);
      }
      const record: MembershipRecord = { ...args.create };
      this.state.memberships.push(record);
      return Promise.resolve(record);
    },
  };

  readonly role = {
    findFirst: () => Promise.resolve({ id: 'role_owner', name: 'Owner' }),
  };

  /**
   * Approval reads the attached documents to re-check the required set. Only
   * `findMany` with a `select` exists, because that is all it does — a service
   * that started deleting or rewriting documents during approval would fail here
   * rather than pass against a permissive mock.
   */
  readonly shopDocument = {
    findMany: (args: { where: { applicationId: string }; select: Record<string, boolean> }) => {
      const rows = this.state.documents
        .filter((d) => d.applicationId === args.where.applicationId)
        .map((d) => {
          const projected: Record<string, unknown> = {};
          for (const key of Object.keys(args.select)) projected[key] = d[key as keyof DocRecord];
          return projected;
        });
      return Promise.resolve(rows);
    },
  };

  readonly category = {
    findUnique: (args: ById) =>
      Promise.resolve(this.world.categories.includes(args.where.id) ? { id: args.where.id } : null),
  };

  async $transaction<T>(fn: (tx: FakeDb) => Promise<T>): Promise<T> {
    this.world.transactions += 1;
    const snapshot = structuredClone(this.state);
    try {
      return await fn(this);
    } catch (err) {
      // Imitates rollback. Not proof of database atomicity — see the file header.
      this.state.applications = snapshot.applications;
      this.state.events = snapshot.events;
      this.state.shops = snapshot.shops;
      this.state.memberships = snapshot.memberships;
      this.state.documents = snapshot.documents;
      throw err;
    }
  }
}

// ── harness ───────────────────────────────────────────────────────────────────

const APPLICANT = 'usr_applicant';
const REVIEWER = 'usr_reviewer';
const CATEGORY = 'cat_kirana';

/** A complete, submitted application: the only state approval is legal from. */
function submittedApplication(overrides: Partial<AppRecord> = {}): AppRecord {
  const now = new Date('2026-08-20T04:00:00.000Z');
  return {
    id: 'app_1',
    reference: 'GP-ABC234',
    applicantId: APPLICANT,
    status: 'SUBMITTED',
    shopId: null,
    shopName: 'Namaste Kirana Pasal',
    shopNameNp: 'नमस्ते किराना पसल',
    description: 'Daily groceries in Baneshwor.',
    categoryId: CATEGORY,
    contactPhone: '9801234567',
    contactEmail: null,
    area: 'Baneshwor, Kathmandu',
    fullAddress: 'Ward 10, New Baneshwor',
    lat: 27.6939,
    lng: 85.3395,
    deliveryRadiusKm: 2.5,
    hours: '7am – 9pm',
    soloMode: true,
    ownerName: 'Sita Sharma',
    ownerNameNp: 'सीता शर्मा',
    citizenshipNo: '12-34-56-78901',
    registrationNo: null,
    panNo: null,
    vatNo: null,
    payoutMethod: 'BANK',
    bankName: 'Nabil Bank',
    bankBranch: 'Baneshwor',
    bankAccountNo: '01234567890123',
    bankAccountName: 'Sita Sharma',
    walletNumber: null,
    acceptedTermsAt: now,
    acceptedTermsVersion: '1.0.0',
    submittedAt: now,
    submitCount: 1,
    reviewedAt: null,
    reviewedById: null,
    decisionNote: null,
    reviewerNote: null,
    changesRequested: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

interface Harness {
  service: OnboardingService;
  state: State;
  world: World;
  approvals: ApplicationApprovedEvent[];
  current: () => AppRecord;
  approvedEvents: () => EventRecord[];
}

/**
 * One attached document, accepted unless a test says otherwise. `kind` is the
 * only thing most tests care about, so everything else has a plausible default.
 */
function document(kind: ShopDocumentKind, overrides: Partial<DocRecord> = {}): DocRecord {
  return {
    id: `doc_${kind.toLowerCase()}`,
    applicationId: 'app_1',
    kind,
    storageKey: `private/shop-applications/app_1/${kind.toLowerCase()}.jpg`,
    fileName: `${kind.toLowerCase()}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 204_800,
    review: 'PENDING',
    reviewNote: null,
    createdAt: new Date('2026-08-20T03:00:00.000Z'),
    ...overrides,
  };
}

/**
 * The full required set for a BANK payout, which is what `submittedApplication`
 * describes. Approval refuses without these, so every test that expects to reach
 * the transaction needs them attached.
 */
function completeDocuments(): DocRecord[] {
  return [
    document('CITIZENSHIP_FRONT'),
    document('CITIZENSHIP_BACK'),
    document('SHOP_PHOTO'),
    document('BANK_PROOF'),
  ];
}

function harness(overrides: Partial<AppRecord> = {}, documents = completeDocuments()): Harness {
  const state: State = {
    applications: [submittedApplication(overrides)],
    events: [],
    shops: [],
    memberships: [],
    documents,
  };
  const world: World = {
    takenSlugs: new Set<string>(),
    categories: [CATEGORY],
    provisionAttempts: 0,
    transactions: 0,
  };

  const prisma = new FakeDb(state, world) as unknown as PrismaService;
  const shops = new ShopsService(prisma);

  // Approval must not consult the policy service — terms were accepted at submit.
  // Making every method explode proves it, instead of merely hoping.
  const policy = {
    current: (): never => {
      throw new Error('PolicyService must not be consulted during approval');
    },
    accept: (): never => {
      throw new Error('PolicyService must not be consulted during approval');
    },
  } as unknown as PolicyService;

  const emitter = new EventEmitter2();
  const approvals: ApplicationApprovedEvent[] = [];
  emitter.on(EVENTS.APPLICATION_APPROVED, (payload: ApplicationApprovedEvent) => {
    approvals.push(payload);
  });

  return {
    service: new OnboardingService(prisma, shops, policy, emitter),
    state,
    world,
    approvals,
    current: () => {
      const row = state.applications.find((a) => a.id === 'app_1');
      assert.ok(row, 'the application should still exist');
      return row;
    },
    approvedEvents: () => state.events.filter((e) => e.type === 'approved'),
  };
}

const DTO = {
  note: 'Approved — welcome to GoPasal.',
  internalNote: 'Citizenship number matches the uploaded scan.',
};

// ── refusals that must never open a transaction ───────────────────────────────

describe('approve — preflight refusals', () => {
  it('404s an application that does not exist', async () => {
    const h = harness();
    await assert.rejects(
      () => h.service.approve(REVIEWER, 'app_missing', DTO),
      (err: unknown) => err instanceof NotFoundException,
    );
    assert.equal(h.world.transactions, 0);
  });

  it('refuses a draft, because a draft has not been submitted for a decision', async () => {
    const h = harness({ status: 'DRAFT', submittedAt: null, submitCount: 0 });
    await assert.rejects(
      () => h.service.approve(REVIEWER, 'app_1', DTO),
      (err: unknown) => err instanceof ConflictException,
    );
    assert.equal(h.world.transactions, 0, 'no transaction should be opened');
    assert.equal(h.world.provisionAttempts, 0);
    assert.equal(h.current().status, 'DRAFT');
  });

  it('refuses an application that was already rejected', async () => {
    const h = harness({ status: 'REJECTED' });
    await assert.rejects(
      () => h.service.approve(REVIEWER, 'app_1', DTO),
      (err: unknown) => err instanceof ConflictException,
    );
    assert.equal(h.state.shops.length, 0);
  });

  it('refuses to approve while required details are missing, and names them', async () => {
    const h = harness({ citizenshipNo: null, bankAccountNo: '  ' });
    await assert.rejects(
      () => h.service.approve(REVIEWER, 'app_1', DTO),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        const body = err.getResponse();
        assert.ok(typeof body === 'object' && body !== null && 'missing' in body);
        const { missing } = body as { missing: string[] };
        assert.deepEqual(missing, ['citizenshipNo', 'bankAccountNo']);
        return true;
      },
    );
    assert.equal(h.world.transactions, 0);
  });

  it('refuses when the chosen category has since been deleted', async () => {
    const h = harness({ categoryId: 'cat_gone' });
    await assert.rejects(
      () => h.service.approve(REVIEWER, 'app_1', DTO),
      (err: unknown) => err instanceof BadRequestException,
    );
    assert.equal(h.world.transactions, 0);
    assert.equal(h.state.shops.length, 0);
  });

  it('refuses to approve an application with no documents attached at all', async () => {
    const h = harness({}, []);
    await assert.rejects(
      () => h.service.approve(REVIEWER, 'app_1', DTO),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        const body = err.getResponse();
        assert.ok(typeof body === 'object' && body !== null && 'missingDocuments' in body);
        const { missingDocuments: missing } = body as { missingDocuments: string[] };
        assert.deepEqual(missing, [
          'CITIZENSHIP_FRONT',
          'CITIZENSHIP_BACK',
          'SHOP_PHOTO',
          'BANK_PROOF',
        ]);
        return true;
      },
    );
    assert.equal(h.world.transactions, 0, 'no shop may be provisioned without the KYC set');
    assert.equal(h.state.shops.length, 0);
  });

  it('refuses when one required document is missing, and names only that one', async () => {
    const h = harness({}, completeDocuments().filter((d) => d.kind !== 'SHOP_PHOTO'));
    await assert.rejects(
      () => h.service.approve(REVIEWER, 'app_1', DTO),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        const { missingDocuments: missing } = err.getResponse() as { missingDocuments: string[] };
        assert.deepEqual(missing, ['SHOP_PHOTO']);
        return true;
      },
    );
    assert.equal(h.state.shops.length, 0);
  });

  /**
   * The case the second gate exists for: a reviewer can reject one document
   * without moving the application out of SUBMITTED, and approving from there
   * would create a shop whose citizenship scan they had just called unusable.
   */
  it('refuses when a required document is present but was rejected', async () => {
    const documents: DocRecord[] = completeDocuments().map((d) =>
      d.kind === 'CITIZENSHIP_BACK'
        ? { ...d, review: 'REJECTED', reviewNote: 'Blurred — retake it.' }
        : d,
    );
    const h = harness({}, documents);
    await assert.rejects(
      () => h.service.approve(REVIEWER, 'app_1', DTO),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        const body = err.getResponse() as { message: string; missingDocuments: string[] };
        assert.deepEqual(body.missingDocuments, ['CITIZENSHIP_BACK']);
        assert.match(body.message, /request changes/i, 'the reviewer is told what to do instead');
        return true;
      },
    );
    assert.equal(h.world.transactions, 0);
  });

  it('does not demand bank proof from a seller who chose a wallet payout', async () => {
    const h = harness(
      { payoutMethod: 'ESEWA', bankName: null, bankAccountNo: null, bankAccountName: null, walletNumber: '9801234567' },
      completeDocuments().filter((d) => d.kind !== 'BANK_PROOF'),
    );
    const view = await h.service.approve(REVIEWER, 'app_1', DTO);
    assert.equal(view.status, 'APPROVED');
    assert.equal(h.state.shops.length, 1);
  });
});

// ── the transaction itself ────────────────────────────────────────────────────

describe('approve — provisioning', () => {
  it('creates exactly one shop, one Owner membership and the back-link', async () => {
    const h = harness();
    const view = await h.service.approve(REVIEWER, 'app_1', DTO);

    assert.equal(view.status, 'APPROVED');
    assert.equal(h.world.transactions, 1);
    assert.equal(h.state.shops.length, 1);

    const shop = h.state.shops[0];
    assert.ok(shop);
    assert.equal(shop.slug, 'namaste-kirana-pasal');
    assert.equal(shop.name, 'Namaste Kirana Pasal');
    assert.equal(shop.ownerId, APPLICANT, 'the applicant becomes the owner');
    assert.equal(shop.status, 'ACTIVE', 'the review PENDING waits for has just happened');
    assert.equal(shop.verified, true);
    assert.equal(shop.deliveryRadiusKm, 2.5, 'the applied-for service radius carries over');
    assert.equal(shop.soloMode, true);

    assert.deepEqual(h.state.memberships, [
      { userId: APPLICANT, shopId: shop.id, roleId: 'role_owner', status: 'ACTIVE' },
    ]);

    const row = h.current();
    assert.equal(row.shopId, shop.id, 'the application is back-linked to the shop');
    assert.equal(row.reviewedById, REVIEWER);
    assert.ok(row.reviewedAt instanceof Date);
  });

  it('records one approved event and keeps the internal note out of the applicant message', async () => {
    const h = harness();
    await h.service.approve(REVIEWER, 'app_1', DTO);

    const events = h.approvedEvents();
    assert.equal(events.length, 1);
    const event = events[0];
    assert.ok(event);
    assert.equal(event.actorId, REVIEWER);
    assert.equal(event.message, DTO.note);
    assert.ok(
      !event.message?.includes(DTO.internalNote),
      'the applicant-facing message must not carry the internal note',
    );
    assert.ok(event.meta && typeof event.meta === 'object' && !Array.isArray(event.meta));
    const meta = event.meta as { shopId?: unknown; slug?: unknown; internalNote?: unknown };
    assert.equal(meta.shopId, h.state.shops[0]?.id);
    assert.equal(meta.slug, 'namaste-kirana-pasal');
    assert.equal(meta.internalNote, DTO.internalNote, 'internal notes live in meta, not message');
  });

  it('splits the applicant-visible note from the reviewer-only note on the row', async () => {
    const h = harness();
    const view = await h.service.approve(REVIEWER, 'app_1', DTO);

    const row = h.current();
    assert.equal(row.decisionNote, DTO.note);
    assert.equal(row.reviewerNote, DTO.internalNote);
    // The reviewer view is allowed to show the internal note; that it is nested
    // under `internal` rather than spread onto the row is what keeps the
    // applicant projection from ever picking it up by accident.
    assert.equal(view.internal.reviewerNote, DTO.internalNote);
  });

  it('emits one approval event, carrying the shop but never the internal note', async () => {
    const h = harness();
    await h.service.approve(REVIEWER, 'app_1', DTO);

    assert.equal(h.approvals.length, 1);
    const payload = h.approvals[0];
    assert.ok(payload);
    assert.equal(payload.applicationId, 'app_1');
    assert.equal(payload.reference, 'GP-ABC234');
    assert.equal(payload.applicantId, APPLICANT);
    assert.equal(payload.reviewerId, REVIEWER);
    assert.equal(payload.shopId, h.state.shops[0]?.id);
    assert.equal(payload.shopSlug, 'namaste-kirana-pasal');
    assert.equal(payload.note, DTO.note);
    assert.equal(
      Object.keys(payload).includes('reviewerNote'),
      false,
      'the notification payload must not be able to leak the internal note',
    );
  });

  /**
   * The reviewer view is the most privileged applicant projection there is, so if
   * a storage key were ever going to escape it would escape here. Documents are
   * serialised by the single `toDocumentView` mapper, and this asserts what that
   * mapper is for.
   */
  it('shows the reviewer each document without ever handing over its storage key', async () => {
    const h = harness();
    const view = await h.service.approve(REVIEWER, 'app_1', DTO);

    assert.equal(view.documents.length, 4);
    const front = view.documents.find((d) => d.kind === 'CITIZENSHIP_FRONT');
    assert.ok(front);
    assert.equal(front.fileName, 'citizenship_front.jpg');
    assert.equal(front.mimeType, 'image/jpeg');
    assert.equal(front.sizeBytes, 204_800);
    assert.equal(front.review, 'PENDING');
    assert.ok(front.uploadedAt instanceof Date);
    for (const doc of view.documents) {
      assert.equal('storageKey' in doc, false, 'a storage key must never be serialised');
    }
    // Nothing anywhere in the payload may contain the private prefix either — that
    // catches a key smuggled through some other field, not just the obvious one.
    assert.ok(!JSON.stringify(view).includes('private/shop-applications'));
  });
});

// ── idempotency and concurrency ───────────────────────────────────────────────

describe('approve — idempotency', () => {
  it('is a no-op the second time: same shop, no duplicate membership, no second event', async () => {
    const h = harness();
    const first = await h.service.approve(REVIEWER, 'app_1', DTO);
    const second = await h.service.approve(REVIEWER, 'app_1', DTO);

    assert.equal(second.status, 'APPROVED');
    assert.equal(second.shop?.id, first.shop?.id);
    assert.equal(h.state.shops.length, 1, 'a retry must not create a second shop');
    assert.equal(h.state.memberships.length, 1);
    assert.equal(h.approvedEvents().length, 1, 'a retry must not append a second timeline entry');
    assert.equal(h.approvals.length, 1, 'a retry must not notify the applicant twice');
    assert.equal(h.world.transactions, 1, 'the short-circuit happens before any transaction');
    assert.equal(h.world.provisionAttempts, 1);
  });

  it('does not short-circuit on an APPROVED row that has no shop — it finishes the job', async () => {
    // A half-finished state should never be reachable, but if a row is somehow
    // APPROVED with `shopId` null, the short-circuit must not swallow it and
    // report success with no shop. The state machine then refuses it, because
    // APPROVED is not a status a decision can be made from — a conflict a human
    // can see, rather than a lie about a shop that does not exist.
    const h = harness({ status: 'APPROVED', shopId: null });
    await assert.rejects(
      () => h.service.approve(REVIEWER, 'app_1', DTO),
      (err: unknown) => err instanceof ConflictException,
    );
    assert.equal(h.state.shops.length, 0);
  });

  it('accepts the outcome when another reviewer approved it a moment earlier', async () => {
    const h = harness();
    h.state.shops.push({
      id: 'shop_ghost',
      slug: 'namaste-kirana-pasal',
      name: 'Namaste Kirana Pasal',
      ownerId: APPLICANT,
      status: 'ACTIVE',
      verified: true,
      categoryId: CATEGORY,
      deliveryRadiusKm: 2.5,
      soloMode: true,
    });
    h.world.takenSlugs.add('namaste-kirana-pasal');
    h.world.beforeClaim = () => {
      const row = h.current();
      row.status = 'APPROVED';
      row.shopId = 'shop_ghost';
    };

    const view = await h.service.approve(REVIEWER, 'app_1', DTO);

    assert.equal(view.status, 'APPROVED');
    assert.equal(view.shop?.id, 'shop_ghost', 'the caller is told about the shop that exists');
    assert.equal(h.world.provisionAttempts, 0, 'we must not create a second shop');
    assert.equal(h.state.shops.length, 1);
    assert.equal(h.approvals.length, 0, 'the reviewer who won already sent the notification');
  });

  it('conflicts when the application was decided the other way while we looked at it', async () => {
    const h = harness();
    h.world.beforeClaim = () => {
      h.current().status = 'REJECTED';
    };

    await assert.rejects(
      () => h.service.approve(REVIEWER, 'app_1', DTO),
      (err: unknown) => {
        assert.ok(err instanceof ConflictException);
        assert.match(err.message, /awaiting a decision/);
        assert.match(err.message, /not approved/, 'the message should name the current status');
        return true;
      },
    );
    assert.equal(h.state.shops.length, 0);
    assert.equal(h.approvals.length, 0);
  });
});

// ── the slug retry, which must stay narrow ────────────────────────────────────

describe('approve — slug collisions', () => {
  it('retries with a fresh slug and still provisions only one shop', async () => {
    const h = harness();
    let fired = false;
    h.world.shopCreateTrap = (slug) => {
      if (fired) return null;
      fired = true;
      // Another approval committed this slug between our lookup and our insert.
      h.world.takenSlugs.add(slug);
      return uniqueError(['slug']);
    };

    await h.service.approve(REVIEWER, 'app_1', DTO);

    assert.equal(h.world.provisionAttempts, 2, 'exactly one retry');
    assert.equal(h.world.transactions, 2);
    assert.equal(h.state.shops.length, 1, 'the rolled-back attempt left nothing behind');
    assert.equal(h.state.shops[0]?.slug, 'namaste-kirana-pasal-2');
    assert.equal(h.state.memberships.length, 1);
    assert.equal(h.approvedEvents().length, 1, 'the abandoned attempt wrote no timeline entry');
    assert.equal(h.approvals.length, 1);
    assert.equal(h.current().status, 'APPROVED');
    assert.equal(h.current().shopId, h.state.shops[0]?.id);
  });

  it('gives up after three attempts, leaving the application untouched', async () => {
    const h = harness();
    h.world.shopCreateTrap = (slug) => {
      h.world.takenSlugs.add(slug);
      return uniqueError(['slug']);
    };

    await assert.rejects(
      () => h.service.approve(REVIEWER, 'app_1', DTO),
      (err: unknown) => {
        assert.ok(err instanceof ConflictException);
        assert.match(err.message, /storefront address/);
        return true;
      },
    );

    assert.equal(h.world.provisionAttempts, 3);
    assert.equal(h.state.shops.length, 0);
    assert.equal(h.state.memberships.length, 0);
    assert.equal(h.approvedEvents().length, 0);
    assert.equal(h.approvals.length, 0);
    const row = h.current();
    assert.equal(row.status, 'SUBMITTED', 'the claim was rolled back');
    assert.equal(row.shopId, null);
    assert.equal(row.reviewedById, null);
  });

  it('rethrows a unique violation that is not the slug instead of retrying it', async () => {
    const h = harness();
    h.world.membershipTrap = () => uniqueError(['userId', 'shopId']);

    await assert.rejects(
      () => h.service.approve(REVIEWER, 'app_1', DTO),
      (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError,
    );

    assert.equal(h.world.provisionAttempts, 1, 'only slug collisions are retried');
    assert.equal(h.world.transactions, 1);
    assert.equal(h.state.shops.length, 0, 'the shop was rolled back with the membership');
    assert.equal(h.current().status, 'SUBMITTED');
    assert.equal(h.approvals.length, 0);
  });
});




