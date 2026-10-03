import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validate } from 'class-validator';
import { RequestOtpDto, VerifyOtpDto } from '../../auth/dto/auth.dto';
import type { AuthService } from '../../auth/auth.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { DeleteAccountDto } from './dto/users.dto';
import { UsersService } from './users.service';

const USER_ID = 'user-privacy';

function service(prisma: object, auth: object = {}) {
  return new UsersService(prisma as PrismaService, auth as AuthService);
}

describe('customer privacy controls', () => {
  it('does not let a purpose-bound deletion code pass through the public login exchange', async () => {
    const request = Object.assign(new RequestOtpDto(), {
      phone: '9800000000',
      purpose: 'account_deletion',
    });
    const verify = Object.assign(new VerifyOtpDto(), {
      phone: '9800000000',
      code: '123456',
      purpose: 'account_deletion',
    });
    assert.ok((await validate(request)).some((error) => error.property === 'purpose'));
    assert.ok((await validate(verify)).some((error) => error.property === 'purpose'));
  });

  it('requires both the exact deletion phrase and retention acknowledgement', async () => {
    const body = Object.assign(new DeleteAccountDto(), {
      code: '123456',
      confirmation: 'delete my account',
      acknowledgeRetention: false,
    });
    const errors = await validate(body);
    assert.ok(errors.some((error) => error.property === 'confirmation'));
    assert.ok(errors.some((error) => error.property === 'acknowledgeRetention'));
  });

  it('exports the account without selecting secrets or internal seller-review data', async () => {
    let select: Record<string, unknown> | undefined;
    let audit: Record<string, unknown> | undefined;
    const prisma = {
      user: {
        findUnique: (args: { select: Record<string, unknown> }) => {
          select = args.select;
          return Promise.resolve({ id: USER_ID, orders: [] });
        },
      },
      auditLog: {
        create: (args: { data: Record<string, unknown> }) => {
          audit = args.data;
          return Promise.resolve({ id: 'audit-export' });
        },
      },
    };

    const result = await service(prisma).exportData(USER_ID);
    const selection = JSON.stringify(select);
    assert.equal(result.schemaVersion, '1.0');
    assert.ok(selection.includes('sessions'));
    assert.ok(selection.includes('shopApplications'));
    assert.ok(!selection.includes('refreshTokenHash'));
    assert.ok(!selection.includes('storageKey'));
    assert.ok(!selection.includes('reviewerNote'));
    assert.ok(!selection.includes('rawPayload'));
    assert.equal(audit?.action, 'user.data_exported');
  });

  it('reports every live responsibility instead of allowing destructive deletion', async () => {
    const counts = [1, 2, 1, 1, 3, 1, 1, 1, 1, 2, 1, 1, 1];
    let cursor = 0;
    const count = () => Promise.resolve(counts[cursor++] ?? 0);
    const prisma = {
      user: { findFirst: () => Promise.resolve({ id: USER_ID, phone: '9800000000' }) },
      shop: { count },
      shopMembership: { count },
      platformMembership: { count },
      rider: { count },
      order: { count },
      dispute: { count },
      refund: { count },
      groupOrder: { count },
      groupOrderParticipant: { count },
      supportTicket: { count },
      subscription: { count },
      shopApplication: { count },
      legalHold: { count },
    };

    const result = await service(prisma).deletionEligibility(USER_ID);
    assert.equal(result.eligible, false);
    assert.equal(result.blockers.length, 13);
    assert.deepEqual(
      result.blockers.map((row) => row.code),
      [
        'SHOP_OWNER',
        'SHOP_ROLE',
        'PLATFORM_ROLE',
        'RIDER_PROFILE',
        'ACTIVE_ORDER',
        'OPEN_DISPUTE',
        'PENDING_REFUND',
        'HOSTED_GROUP_ORDER',
        'JOINED_GROUP_ORDER',
        'OPEN_SUPPORT_TICKET',
        'ACTIVE_SUBSCRIPTION',
        'ACTIVE_SHOP_APPLICATION',
        'LEGAL_HOLD',
      ],
    );
  });

  it('purpose-verifies the code, revokes access and pseudonymises without deleting orders', async () => {
    const actions: string[] = [];
    const count = () => Promise.resolve(0);
    const deleteMany = (name: string) => (args: unknown) => {
      actions.push(`${name}.deleteMany:${JSON.stringify(args)}`);
      return Promise.resolve({ count: 1 });
    };
    const updateMany = (name: string) => (args: unknown) => {
      actions.push(`${name}.updateMany:${JSON.stringify(args)}`);
      return Promise.resolve({ count: 1 });
    };
    const tx = {
      $queryRaw: () => Promise.resolve([{ pg_advisory_xact_lock: null }]),
      shop: { count },
      shopMembership: { count },
      platformMembership: { count },
      rider: { count },
      order: { count },
      dispute: { count },
      refund: { count },
      groupOrder: { count },
      groupOrderParticipant: { count },
      supportTicket: { count },
      subscription: { count },
      legalHold: { count },
      session: { deleteMany: deleteMany('session') },
      otpChallenge: { deleteMany: deleteMany('otpChallenge') },
      address: { updateMany: updateMany('address') },
      cart: { deleteMany: deleteMany('cart') },
      savedShop: { deleteMany: deleteMany('savedShop') },
      savedProduct: { deleteMany: deleteMany('savedProduct') },
      notification: { deleteMany: deleteMany('notification') },
      supportAssistantSession: { deleteMany: deleteMany('supportAssistantSession') },
      shopConversation: { deleteMany: deleteMany('shopConversation') },
      loyaltyTransaction: { deleteMany: deleteMany('loyaltyTransaction') },
      loyaltyAccount: { deleteMany: deleteMany('loyaltyAccount') },
      // `deleteAccount` reads the retention window before pseudonymising, and
      // the fake did not offer this model — so the test failed on a missing
      // `findUnique` rather than on anything it was written to assert. Null
      // stands for "no policy row configured", which exercises the service's
      // own 1830-day default.
      retentionPolicy: { findUnique: () => Promise.resolve(null) },
      dataErasureRequest: {
        upsert: (args: unknown) => {
          actions.push(`dataErasureRequest.upsert:${JSON.stringify(args)}`);
          return Promise.resolve({});
        },
      },
      shopApplication: {
        count,
        findMany: () => Promise.resolve([{ id: 'app_123', documents: [{ storageKey: 'private/shop-applications/app_123/owned.pdf' }] }]),
        deleteMany: deleteMany('shopApplication'),
      },
      privateObjectDeletion: {
        createMany: (args: unknown) => {
          actions.push(`privateObjectDeletion.createMany:${JSON.stringify(args)}`);
          return Promise.resolve({ count: 1 });
        },
      },
      user: {
        update: (args: unknown) => {
          actions.push(`user.update:${JSON.stringify(args)}`);
          return Promise.resolve({ id: USER_ID });
        },
      },
      auditLog: {
        create: (args: unknown) => {
          actions.push(`auditLog.create:${JSON.stringify(args)}`);
          return Promise.resolve({ id: 'audit-delete' });
        },
      },
    };
    const prisma = {
      user: { findFirst: () => Promise.resolve({ id: USER_ID, phone: '9800000000' }) },
      $transaction: <T>(work: (client: typeof tx) => Promise<T>) => work(tx),
    };
    let verification: Record<string, string> | undefined;
    const auth = {
      verifyOtpChallenge: (input: Record<string, string>) => {
        verification = input;
        return Promise.resolve(input.phone);
      },
    };

    const result = await service(prisma, auth).deleteAccount(USER_ID, '654321', 'Leaving');
    assert.deepEqual(verification, {
      phone: '9800000000',
      code: '654321',
      purpose: 'account_deletion',
    });
    assert.equal(result.deleted, true);
    assert.ok(actions.some((entry) => entry.includes('session.deleteMany')));
    assert.ok(actions.some((entry) => entry.includes('otpChallenge.deleteMany')));
    assert.ok(actions.some((entry) => entry.includes('status":"DELETED')));
    assert.ok(actions.some((entry) => entry.includes('user.account_deleted')));
    assert.ok(actions.some((entry) => entry.includes('shopConversation.deleteMany')));
    assert.ok(actions.some((entry) => entry.includes('private/shop-applications/app_123/owned.pdf')));
    assert.ok(actions.findIndex((entry) => entry.startsWith('privateObjectDeletion.createMany')) < actions.findIndex((entry) => entry.startsWith('shopApplication.deleteMany')));
    assert.ok(!actions.some((entry) => entry.startsWith('order.delete')));
  });
});
