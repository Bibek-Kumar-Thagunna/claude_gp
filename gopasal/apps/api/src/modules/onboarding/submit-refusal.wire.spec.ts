import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DocumentReviewState, PayoutMethod, ShopDocumentKind } from '@prisma/client';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { ShopsService } from '../catalog/shops.service';
import type { PolicyService } from '../policy/policy.service';
import { OnboardingService } from './onboarding.service';

/**
 * The submit refusal, end to end through the layer that actually talks to the
 * client: real `OnboardingService.submit` → the exception it throws → the real
 * global `AllExceptionsFilter` → the JSON body.
 *
 * It exists because the runtime E2E harness (`pnpm verify:uploads`) found a bug
 * every unit test had missed. The service was correct and the gate was enforced —
 * a document-less submit was refused with 400 — but the filter rebuilt the
 * response from `message` alone, so `missing` and `missingDocuments` never
 * reached the wire and the seller wizard had no way to say *which* scan was
 * absent. Asserting on `err.getResponse()`, as the other onboarding specs do,
 * cannot see that: the loss happens one layer further out. So this file asserts
 * on the serialised body, which is the only thing a client ever sees.
 *
 * Prisma is a two-delegate stand-in because that is genuinely all the refusal
 * path touches: read the owned application, read its attached documents, refuse.
 * Nothing is stubbed that would let the assertion pass for the wrong reason —
 * `missingDocuments` is computed by the real `application-state` module from rows
 * shaped like the real `select`.
 */

interface DocRow {
  kind: ShopDocumentKind;
  review: DocumentReviewState;
}

interface AppRow {
  id: string;
  applicantId: string;
  status: string;
  payoutMethod: PayoutMethod | null;
  [field: string]: unknown;
}

const APPLICANT = 'usr_applicant';

/**
 * A DRAFT with every typed field filled in — the state the E2E harness creates
 * before it uploads anything, so `missing` is empty and `missingDocuments` is the
 * only reason the submit can fail.
 */
function draft(overrides: Partial<AppRow> = {}): AppRow {
  return {
    id: 'app_1',
    reference: 'GP-ABC234',
    applicantId: APPLICANT,
    status: 'DRAFT',
    shopName: 'E2E Verify Pasal',
    categoryId: 'cat_kirana',
    contactPhone: '9840000009',
    area: 'Baneshwor, Kathmandu',
    fullAddress: 'Ward 10, New Baneshwor, Kathmandu',
    lat: 27.6939,
    lng: 85.3395,
    locationCapturedAt: new Date('2026-09-09T10:00:00.000Z'),
    ownerName: 'E2E Verification Owner',
    citizenshipNo: '12-34-56-78901',
    registrationNo: 'REG-12345',
    panNo: '123456789',
    vatNo: null,
    payoutMethod: 'BANK',
    bankName: 'Nabil Bank',
    bankAccountNo: '01234567890123',
    bankAccountName: 'E2E Verification Owner',
    walletNumber: null,
    ...overrides,
  };
}

/** Only the two delegates the refusal path uses. */
function fakePrisma(app: AppRow, documents: DocRow[]): PrismaService {
  return {
    shopApplication: {
      findFirst: (args: { where: { id: string; applicantId: string } }) =>
        Promise.resolve(
          args.where.id === app.id && args.where.applicantId === app.applicantId ? app : null,
        ),
    },
    shopDocument: {
      findMany: (args: { where: { applicationId: string }; select: Record<string, boolean> }) =>
        Promise.resolve(
          args.where.applicationId !== app.id
            ? []
            : documents.map((doc) => {
                const projected: Record<string, unknown> = {};
                for (const key of Object.keys(args.select)) projected[key] = doc[key as keyof DocRow];
                return projected;
              }),
        ),
    },
    category: {
      findUnique: () => Promise.resolve({ slug: 'grocery' }),
    },
  } as unknown as PrismaService;
}

function service(app: AppRow, documents: DocRow[]): OnboardingService {
  const prisma = fakePrisma(app, documents);
  // A refusal happens before terms are read; making the policy explode proves the
  // refusal is reached rather than merely hoping it is.
  const policy = {
    current: (): never => {
      throw new Error('PolicyService must not be consulted by a refused submit');
    },
    accept: (): never => {
      throw new Error('PolicyService must not be consulted by a refused submit');
    },
  } as unknown as PolicyService;
  return new OnboardingService(prisma, new ShopsService(prisma), policy, new EventEmitter2());
}

/** The real global filter, over a recorder in place of express. */
function serialise(exception: unknown): { status: number; body: Record<string, unknown> } {
  let status = 0;
  let body: Record<string, unknown> = {};
  const res = {
    status: (code: number) => {
      status = code;
      return res;
    },
    json: (payload: Record<string, unknown>) => {
      body = payload;
      return res;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({
        method: 'POST',
        url: '/api/v1/seller/onboarding/applications/app_1/submit',
      }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status, body };
}

/** Drive the real service and serialise whatever it throws. */
async function submitAndSerialise(
  app: AppRow,
  documents: DocRow[],
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    await service(app, documents).submit(APPLICANT, app.id, { acceptTerms: true });
  } catch (err) {
    assert.ok(err instanceof BadRequestException, `expected a 400, got ${String(err)}`);
    return serialise(err);
  }
  return assert.fail('submit should have been refused');
}

const doc = (kind: ShopDocumentKind, review: DocumentReviewState = 'PENDING'): DocRow => ({
  kind,
  review,
});

describe('submit refusal · what the client actually receives', () => {
  it('names every missing document when nothing is attached', async () => {
    const { status, body } = await submitAndSerialise(draft(), []);

    assert.equal(status, 400);
    assert.deepEqual([...(body.missingDocuments as string[])].sort(), [
      'BANK_PROOF',
      'BUSINESS_LICENCE',
      'CITIZENSHIP_BACK',
      'CITIZENSHIP_FRONT',
      'PAN_CERTIFICATE',
      'SHOP_PHOTO',
    ]);
    assert.deepEqual(body.missing, []);
    assert.equal(body.message, 'Some required documents are still missing.');
  });

  it('names only BANK_PROOF when the required KYC papers are there and the payout is a bank', async () => {
    const { body } = await submitAndSerialise(draft(), [
      doc('CITIZENSHIP_FRONT'),
      doc('CITIZENSHIP_BACK'),
      doc('BUSINESS_LICENCE'),
      doc('PAN_CERTIFICATE'),
      doc('SHOP_PHOTO'),
    ]);

    assert.deepEqual(body.missingDocuments, ['BANK_PROOF']);
  });

  it('does not demand a bank proof from a wallet payout', async () => {
    const { body } = await submitAndSerialise(
      draft({ payoutMethod: 'ESEWA', walletNumber: '9840000009' }),
      [
        doc('CITIZENSHIP_FRONT'),
        doc('CITIZENSHIP_BACK'),
        doc('BUSINESS_LICENCE'),
        doc('PAN_CERTIFICATE'),
      ],
    );

    assert.deepEqual(body.missingDocuments, ['SHOP_PHOTO']);
  });

  it('counts a rejected scan as absent, by name', async () => {
    const { body } = await submitAndSerialise(draft(), [
      doc('CITIZENSHIP_FRONT'),
      doc('CITIZENSHIP_BACK'),
      doc('BUSINESS_LICENCE'),
      doc('PAN_CERTIFICATE'),
      doc('SHOP_PHOTO', 'REJECTED'),
      doc('BANK_PROOF'),
    ]);

    assert.deepEqual(body.missingDocuments, ['SHOP_PHOTO']);
  });

  it('reports empty fields and missing documents in one response, not two round trips', async () => {
    const { body } = await submitAndSerialise(draft({ area: null, ownerName: '   ' }), []);

    assert.deepEqual([...(body.missing as string[])].sort(), ['area', 'ownerName']);
    assert.equal((body.missingDocuments as string[]).length, 6);
    assert.equal(body.message, 'Some required details and documents are still missing.');
  });

  it('carries nothing beyond the envelope and the two lists', async () => {
    const { body } = await submitAndSerialise(draft(), []);

    assert.deepEqual(Object.keys(body).sort(), [
      'error',
      'message',
      'missing',
      'missingDocuments',
      'path',
      'statusCode',
      'timestamp',
    ]);
  });
});
