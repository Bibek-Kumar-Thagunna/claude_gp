import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ApplicationStatus } from '@prisma/client';
import {
  DECIDABLE_STATUSES,
  EDITABLE_STATUSES,
  MAX_DOCUMENTS_PER_APPLICATION,
  REVIEWABLE_STATUSES,
  canEdit,
  checkTransition,
  humanStatus,
  isOpen,
  isSingleInstanceKind,
  isTerminal,
  missingDocuments,
  missingForSubmit,
  requiredDocuments,
  unverifiedDocuments,
  type ApplicationAction,
  type SubmittableApplication,
} from './application-state';

/**
 * The state machine is the part of onboarding that must not drift, so the whole
 * matrix is asserted cell by cell rather than a few happy paths. If someone adds
 * a status or loosens a transition, one of these fails and says which.
 */

const STATUSES: ApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
];

const ACTIONS: ApplicationAction[] = [
  'submit',
  'resubmit',
  'withdraw',
  'claim',
  'request_changes',
  'approve',
  'reject',
];

/** The intended lifecycle, written out independently of the implementation. */
const ALLOWED: Record<ApplicationAction, ApplicationStatus[]> = {
  submit: ['DRAFT'],
  resubmit: ['CHANGES_REQUESTED'],
  withdraw: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'],
  claim: ['SUBMITTED'],
  request_changes: ['SUBMITTED', 'UNDER_REVIEW'],
  approve: ['SUBMITTED', 'UNDER_REVIEW'],
  reject: ['SUBMITTED', 'UNDER_REVIEW'],
};

const TARGET: Record<ApplicationAction, ApplicationStatus> = {
  submit: 'SUBMITTED',
  resubmit: 'SUBMITTED',
  withdraw: 'WITHDRAWN',
  claim: 'UNDER_REVIEW',
  request_changes: 'CHANGES_REQUESTED',
  approve: 'APPROVED',
  reject: 'REJECTED',
};

describe('application state matrix', () => {
  for (const action of ACTIONS) {
    for (const from of STATUSES) {
      const expected = ALLOWED[action].includes(from);
      it(`${action} from ${from} is ${expected ? 'allowed' : 'refused'}`, () => {
        const verdict = checkTransition(from, action);
        assert.equal(verdict.allowed, expected);
        assert.equal(verdict.to, TARGET[action]);
        if (expected) {
          assert.equal(verdict.reason, undefined);
        } else {
          assert.ok(verdict.reason, 'a refusal must explain itself');
          assert.ok(
            verdict.reason.includes(humanStatus(from)),
            'the refusal should name the current status',
          );
        }
      });
    }
  }

  it('never allows anything out of a terminal status', () => {
    for (const from of ['APPROVED', 'REJECTED', 'WITHDRAWN'] as ApplicationStatus[]) {
      assert.equal(isTerminal(from), true);
      for (const action of ACTIONS) {
        assert.equal(checkTransition(from, action).allowed, false, `${action} from ${from}`);
      }
    }
  });

  it('treats exactly the four unfinished statuses as open', () => {
    assert.deepEqual(
      STATUSES.filter((s) => isOpen(s)),
      ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'],
    );
  });

  it('lets the applicant edit only while it is theirs to edit', () => {
    assert.deepEqual(STATUSES.filter((s) => canEdit(s)), ['DRAFT', 'CHANGES_REQUESTED']);
    assert.deepEqual([...EDITABLE_STATUSES], ['DRAFT', 'CHANGES_REQUESTED']);
  });

  it('keeps drafts out of the review queue but decisions available on both queue statuses', () => {
    assert.equal(REVIEWABLE_STATUSES.includes('DRAFT'), false);
    for (const status of DECIDABLE_STATUSES) {
      assert.equal(checkTransition(status, 'approve').allowed, true);
      assert.equal(checkTransition(status, 'reject').allowed, true);
      assert.equal(REVIEWABLE_STATUSES.includes(status), true);
    }
  });
});

/** A complete bank-payout application, used as the baseline to remove fields from. */
function completeApplication(): SubmittableApplication {
  return {
    shopName: 'Namaste Kirana Pasal',
    categoryId: 'cat_kirana',
    contactPhone: '9800000000',
    area: 'Baneshwor, Kathmandu',
    fullAddress: 'Ward 10, New Baneshwor',
    lat: 27.6915,
    lng: 85.3419,
    locationCapturedAt: new Date('2026-09-09T10:00:00.000Z'),
    ownerName: 'Sita Sharma',
    citizenshipNo: '12-34-56-78901',
    registrationNo: 'REG-12345',
    panNo: '123456789',
    payoutMethod: 'BANK',
    bankName: 'Nabil Bank',
    bankAccountNo: '01234567890123',
    bankAccountName: 'Sita Sharma',
    walletNumber: null,
  };
}

describe('missingForSubmit', () => {
  it('passes a complete bank application', () => {
    assert.deepEqual(missingForSubmit(completeApplication()), []);
  });

  it('reports every unfilled required field on an empty application', () => {
    const empty: SubmittableApplication = {
      shopName: null,
      categoryId: null,
      contactPhone: null,
      area: null,
      fullAddress: null,
      ownerName: null,
      citizenshipNo: null,
      registrationNo: null,
      panNo: null,
      payoutMethod: null,
      bankName: null,
      bankAccountNo: null,
      bankAccountName: null,
      walletNumber: null,
    };
    assert.deepEqual(missingForSubmit(empty), [
      'shopName',
      'categoryId',
      'contactPhone',
      'area',
      'fullAddress',
      'ownerName',
      'citizenshipNo',
      'registrationNo',
      'panNo',
      'payoutMethod',
    ]);
  });

  it('treats whitespace as empty', () => {
    const app = { ...completeApplication(), shopName: '   ' };
    assert.deepEqual(missingForSubmit(app), ['shopName']);
  });

  it('requires bank details only for a bank payout', () => {
    const app: SubmittableApplication = {
      ...completeApplication(),
      bankName: null,
      bankAccountNo: null,
      bankAccountName: null,
    };
    assert.deepEqual(missingForSubmit(app), ['bankName', 'bankAccountNo', 'bankAccountName']);
  });

  it('requires a wallet number only for a wallet payout, and never bank fields', () => {
    for (const method of ['ESEWA', 'KHALTI'] as const) {
      const app: SubmittableApplication = {
        ...completeApplication(),
        payoutMethod: method,
        bankName: null,
        bankAccountNo: null,
        bankAccountName: null,
        walletNumber: null,
      };
      assert.deepEqual(missingForSubmit(app), ['walletNumber']);
      assert.deepEqual(missingForSubmit({ ...app, walletNumber: '9800000000' }), []);
    }
  });

  it('requires both legal registration and business PAN', () => {
    assert.deepEqual(
      missingForSubmit({ ...completeApplication(), registrationNo: null, panNo: ' ' }),
      ['registrationNo', 'panNo'],
    );
  });

  it('allows location to be completed after approval', () => {
    assert.deepEqual(
      missingForSubmit({ ...completeApplication(), locationCapturedAt: null, lat: null, lng: null }),
      [],
    );
  });
});

describe('required documents', () => {
  const KYC = [
    'CITIZENSHIP_FRONT',
    'CITIZENSHIP_BACK',
    'BUSINESS_LICENCE',
    'PAN_CERTIFICATE',
    'SHOP_PHOTO',
  ] as const;

  it('asks every applicant for identity, registration, PAN and a shopfront photo', () => {
    assert.deepEqual(requiredDocuments(null), [...KYC]);
  });

  it('adds proof of account only for a bank payout', () => {
    assert.deepEqual(requiredDocuments('BANK'), [...KYC, 'BANK_PROOF']);
    assert.deepEqual(requiredDocuments('ESEWA'), [...KYC]);
    assert.deepEqual(requiredDocuments('KHALTI'), [...KYC]);
  });

  it('requires VAT proof only when a VAT number is declared', () => {
    assert.ok(!requiredDocuments('ESEWA').includes('VAT_CERTIFICATE'));
    assert.ok(requiredDocuments('ESEWA', '123456789').includes('VAT_CERTIFICATE'));
  });

  it('requires a regulator licence for a pharmacy', () => {
    assert.ok(requiredDocuments('ESEWA', null, 'pharmacy').includes('REGULATORY_LICENCE'));
    assert.ok(!requiredDocuments('ESEWA', null, 'grocery').includes('REGULATORY_LICENCE'));
  });

  it('reports everything missing when nothing is attached', () => {
    assert.deepEqual(missingDocuments({ payoutMethod: 'BANK', documents: [] }), [
      ...KYC,
      'BANK_PROOF',
    ]);
  });

  it('is satisfied by an attached document a reviewer has not looked at yet', () => {
    const documents = [...KYC, 'BANK_PROOF' as const].map((kind) => ({ kind, review: 'PENDING' as const }));
    assert.deepEqual(missingDocuments({ payoutMethod: 'BANK', documents }), []);
    assert.deepEqual(
      unverifiedDocuments({ payoutMethod: 'BANK', documents }),
      [...KYC, 'BANK_PROOF'],
      'pending papers may enter the queue but may not pass approval',
    );
  });

  it('is satisfied by an accepted document, and unaffected by extras', () => {
    const documents = [
      ...KYC.map((kind) => ({ kind, review: 'ACCEPTED' as const })),
      { kind: 'PAN_CERTIFICATE' as const, review: 'ACCEPTED' as const },
      { kind: 'OTHER' as const, review: 'PENDING' as const },
    ];
    assert.deepEqual(missingDocuments({ payoutMethod: 'ESEWA', documents }), []);
  });

  /**
   * The point of the whole function: a rejected scan does not count. If it did,
   * the applicant could resubmit an unchanged application and the queue would
   * cycle forever between "changes requested" and "submitted".
   */
  it('treats a rejected document as not there', () => {
    const documents = KYC.map((kind) => ({
      kind,
      review: kind === 'SHOP_PHOTO' ? ('REJECTED' as const) : ('ACCEPTED' as const),
    }));
    assert.deepEqual(missingDocuments({ payoutMethod: 'ESEWA', documents }), ['SHOP_PHOTO']);
  });

  it('counts a replacement uploaded alongside a rejected one', () => {
    // An applicant told to retake a photo uploads a new one; the rejected row may
    // still be there. One usable copy is enough.
    const documents = [
      { kind: 'CITIZENSHIP_FRONT' as const, review: 'ACCEPTED' as const },
      { kind: 'CITIZENSHIP_BACK' as const, review: 'ACCEPTED' as const },
      { kind: 'BUSINESS_LICENCE' as const, review: 'ACCEPTED' as const },
      { kind: 'PAN_CERTIFICATE' as const, review: 'ACCEPTED' as const },
      { kind: 'SHOP_PHOTO' as const, review: 'REJECTED' as const },
      { kind: 'SHOP_PHOTO' as const, review: 'PENDING' as const },
    ];
    assert.deepEqual(missingDocuments({ payoutMethod: 'ESEWA', documents }), []);
  });

  it('tolerates a document row with no review state at all', () => {
    // `review` is optional on the input shape so a caller may pass a bare
    // `{ kind }`; that must read as "present", not as "rejected".
    assert.deepEqual(missingDocuments({ payoutMethod: 'ESEWA', documents: KYC.map((kind) => ({ kind })) }), []);
  });

  it('replaces every kind except OTHER, which is the bucket for anything asked for later', () => {
    for (const kind of [
      'CITIZENSHIP_FRONT',
      'CITIZENSHIP_BACK',
      'PAN_CERTIFICATE',
      'VAT_CERTIFICATE',
      'BUSINESS_LICENCE',
      'REGULATORY_LICENCE',
      'SHOP_PHOTO',
      'OWNER_PHOTO',
      'BANK_PROOF',
    ] as const) {
      assert.equal(isSingleInstanceKind(kind), true, `${kind} should replace, not accumulate`);
    }
    assert.equal(isSingleInstanceKind('OTHER'), false);
  });

  it('caps attachments well above the required set, so the cap can never block submission', () => {
    assert.ok(MAX_DOCUMENTS_PER_APPLICATION > requiredDocuments('BANK').length);
  });
});
