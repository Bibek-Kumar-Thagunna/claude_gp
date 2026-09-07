import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * This filter is the last thing every failed request passes through, which makes
 * it the one place where a service's carefully-built error can quietly stop
 * existing. It did: a handler that threw
 * `new BadRequestException({ message, missing, missingDocuments })` reached the
 * client as `message` alone, because the filter rebuilt the body from scratch.
 * Unit tests all asserted against `exception.getResponse()` — the shape *before*
 * this class — so nothing caught it until a real HTTP call did.
 *
 * What is asserted here is therefore the wire contract, not the exception:
 * everything the envelope guarantees, plus the extra fields a handler deliberately
 * attached, minus anything that must not travel (5xx internals, secrets).
 */

interface Sent {
  status: number;
  body: Record<string, unknown>;
}

/** Records the status and body without pulling in express. */
function fakeHost(method = 'POST', url = '/api/v1/seller/onboarding/applications/app_1/submit'): {
  host: ArgumentsHost;
  sent: () => Sent;
} {
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
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method, url }) }),
  } as unknown as ArgumentsHost;
  return { host, sent: () => ({ status, body }) };
}

function through(exception: unknown, method?: string, url?: string): Sent {
  const { host, sent } = fakeHost(method, url);
  new AllExceptionsFilter().catch(exception, host);
  return sent();
}

describe('AllExceptionsFilter · the envelope', () => {
  it('keeps the five envelope fields for a plain string exception', () => {
    const { status, body } = through(new NotFoundException('Application not found'), 'GET', '/api/v1/x');

    assert.equal(status, 404);
    assert.equal(body.statusCode, 404);
    assert.equal(body.message, 'Application not found');
    // Nest wraps a string message in `{ statusCode, message, error }`, so `error`
    // is its human label — not the class name.
    assert.equal(body.error, 'Not Found');
    assert.equal(body.path, '/api/v1/x');
    assert.match(String(body.timestamp), /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(Object.keys(body).sort(), ['error', 'message', 'path', 'statusCode', 'timestamp']);
  });

  it('keeps the string[] message the ValidationPipe produces', () => {
    const { body } = through(
      new BadRequestException({
        statusCode: 400,
        message: ['acceptTerms must be a boolean value', 'property foo should not exist'],
        error: 'Bad Request',
      }),
    );

    assert.deepEqual(body.message, [
      'acceptTerms must be a boolean value',
      'property foo should not exist',
    ]);
    assert.equal(body.error, 'Bad Request');
    // `statusCode` came in on the body too; it must not be duplicated or doubled up.
    assert.equal(body.statusCode, 400);
    assert.deepEqual(Object.keys(body).sort(), ['error', 'message', 'path', 'statusCode', 'timestamp']);
  });

  it('maps a Prisma unique violation to 409 and a missing record to 404', () => {
    const unique = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    assert.equal(through(unique).status, 409);

    const absent = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    const gone = through(absent);
    assert.equal(gone.status, 404);
    assert.equal(gone.body.message, 'Record not found.');
  });
});

describe('AllExceptionsFilter · structured detail reaches the client', () => {
  /** Exactly what `OnboardingService.submit` throws when nothing is attached. */
  const submitRefusal = new BadRequestException({
    message: 'Some required documents are still missing.',
    missing: [],
    missingDocuments: ['CITIZENSHIP_FRONT', 'CITIZENSHIP_BACK', 'SHOP_PHOTO', 'BANK_PROOF'],
  });

  it('serialises missingDocuments onto the response body', () => {
    const { status, body } = through(submitRefusal);

    assert.equal(status, 400);
    assert.deepEqual(body.missingDocuments, [
      'CITIZENSHIP_FRONT',
      'CITIZENSHIP_BACK',
      'SHOP_PHOTO',
      'BANK_PROOF',
    ]);
    assert.deepEqual(body.missing, []);
    assert.equal(body.message, 'Some required documents are still missing.');
  });

  it('keeps an empty array as an empty array rather than dropping the field', () => {
    // The seller wizard distinguishes "no documents are missing" from "the server
    // did not tell me", so `missing: []` has to survive as a present, empty array.
    const { body } = through(submitRefusal);
    assert.ok('missing' in body, 'the `missing` key must be present');
    assert.ok(Array.isArray(body.missing));
  });

  it('passes through the approval refusal shape too', () => {
    const { body } = through(
      new BadRequestException({
        message: 'This application cannot be approved until the required documents are attached.',
        missingDocuments: ['SHOP_PHOTO'],
      }),
    );
    assert.deepEqual(body.missingDocuments, ['SHOP_PHOTO']);
  });

  it('cannot be used to forge the envelope', () => {
    const { status, body } = through(
      new ForbiddenException({
        message: 'Not yours.',
        statusCode: 200,
        path: '/somewhere/else',
        timestamp: 'whenever',
        error: 'Teapot',
        keptDetail: 'yes',
      }),
      'GET',
      '/api/v1/real/path',
    );

    assert.equal(status, 403);
    assert.equal(body.statusCode, 403);
    assert.equal(body.path, '/api/v1/real/path');
    assert.match(String(body.timestamp), /^\d{4}-\d{2}-\d{2}T/);
    // `error` is read from the body by design (Nest puts 'Bad Request' there).
    assert.equal(body.error, 'Teapot');
    assert.equal(body.keptDetail, 'yes');
  });

  it('drops the detail on a 5xx, where the internals are nobody else’s business', () => {
    const { status, body } = through(
      new InternalServerErrorException({
        message: 'Internal server error',
        query: 'SELECT * FROM "User" WHERE phone = $1',
        stack: 'at OnboardingService.submit',
      }),
    );

    assert.equal(status, 500);
    assert.ok(!('query' in body), 'a 5xx must not carry the failing query');
    assert.ok(!('stack' in body));
    assert.deepEqual(Object.keys(body).sort(), ['error', 'message', 'path', 'statusCode', 'timestamp']);
  });

  it('redacts secret-bearing keys, at the top level and nested', () => {
    const { body } = through(
      new BadRequestException({
        message: 'Bad code.',
        codeHash: 'argon2id$hash',
        session: { refreshTokenHash: 'nope', attemptsLeft: 2 },
      }),
    );

    assert.ok(!('codeHash' in body), 'codeHash must never leave the server');
    assert.deepEqual(body.session, { attemptsLeft: 2 });
  });

  it('survives detail that plain JSON.stringify would refuse', () => {
    const circular: Record<string, unknown> = { message: 'Cycle.', kept: 'yes' };
    circular.self = circular;
    const withBigInt = new BadRequestException({ message: 'Big.', count: 9_007_199_254_740_993n });

    const cyclic = through(new BadRequestException(circular));
    assert.equal(cyclic.status, 400);
    assert.equal(cyclic.body.kept, 'yes');
    assert.doesNotThrow(() => JSON.stringify(cyclic.body));

    const big = through(withBigInt);
    assert.equal(typeof big.body.count, 'number');
    assert.doesNotThrow(() => JSON.stringify(big.body));
  });

  it('adds nothing when the handler attached nothing', () => {
    const { body } = through(new BadRequestException('Just a sentence.'));
    assert.deepEqual(Object.keys(body).sort(), ['error', 'message', 'path', 'statusCode', 'timestamp']);
  });
});

describe('AllExceptionsFilter · a Prisma validation error is the caller’s fault, not a 500', () => {
  /**
   * `PrismaClientValidationError` is thrown before the query is sent, so it carries
   * no `code` and the `PrismaClientKnownRequestError` branch cannot see it. It used
   * to fall through to `instanceof Error`, which meant the caller received a **500
   * whose `message` was Prisma's own report** — the rejected argument, the expected
   * type, and a printed skeleton of the query naming the model and its columns.
   *
   * The route that produced it in practice was `PATCH /seller/shops/:shopId` with
   * `{"name": null}`: `@IsOptional()` skipped validation on `null`, so the bad value
   * reached `prisma.shop.update` for a non-nullable column. `UpdateShopDto` now
   * refuses that body outright, but this branch is what protects every route whose
   * DTO has not been audited yet.
   */
  const prismaReport = [
    'Invalid `prisma.shop.update()` invocation:',
    '',
    '{',
    '  where: { id: "shop_1" },',
    '  data: {',
    '    name: null,',
    '        ~~~~',
    '    isOpen: true',
    '  }',
    '}',
    '',
    'Argument `name`: Invalid value provided. Expected String, provided Null.',
  ].join('\n');

  it('answers 400 with a flat message', () => {
    const { status, body } = through(
      new Prisma.PrismaClientValidationError(prismaReport, { clientVersion: 'test' }),
      'PATCH',
      '/api/v1/seller/shops/shop_1',
    );

    assert.equal(status, 400);
    assert.equal(body.statusCode, 400);
    assert.equal(body.message, 'Database request error.');
    assert.equal(body.error, 'BadRequest');
    assert.equal(body.path, '/api/v1/seller/shops/shop_1');
  });

  it('does not hand Prisma’s report to the client', () => {
    const { body } = through(
      new Prisma.PrismaClientValidationError(prismaReport, { clientVersion: 'test' }),
    );

    const wire = JSON.stringify(body);
    assert.ok(!wire.includes('prisma.shop.update'), 'the invocation must not travel');
    assert.ok(!wire.includes('Expected String'), 'the expected type must not travel');
    assert.ok(!wire.includes('isOpen'), 'the query skeleton must not name columns');
    assert.deepEqual(Object.keys(body).sort(), ['error', 'message', 'path', 'statusCode', 'timestamp']);
  });

  it('still reports a genuine server fault as a 500', () => {
    // The branch is narrow on purpose: an ordinary `Error` is not reclassified.
    const { status } = through(new Error('connect ECONNREFUSED 127.0.0.1:15432'));
    assert.equal(status, 500);
  });

  /**
   * The previous test asserted the status and stopped there, which is how the
   * leak below survived. The filter used to do `message = exception.message` for
   * any `Error` it did not recognise, so a failed database connection answered
   * the request with its own DSN, and a `TypeError` answered with the property
   * name it tripped over. `packages/api-client` prefers the body's `message`
   * over its generic 5xx sentence, and every seller screen renders that string,
   * so those went to shopkeepers' screens.
   */
  it('withholds an unrecognised error’s own message from the client', () => {
    const { status, body } = through(
      new Error('connect ECONNREFUSED 127.0.0.1:15432 (user=gopasal password=gopasal_dev_pw)'),
    );

    assert.equal(status, 500);
    assert.equal(body.message, 'Internal server error');
    assert.equal(body.error, 'InternalServerError');
    const wire = JSON.stringify(body);
    assert.ok(!wire.includes('ECONNREFUSED'), 'the driver error must not travel');
    assert.ok(!wire.includes('15432'), 'the database port must not travel');
    assert.ok(!wire.includes('password'), 'credentials must not travel');
  });

  it('withholds a TypeError’s message too', () => {
    const { status, body } = through(new TypeError("Cannot read properties of undefined (reading 'shopId')"));

    assert.equal(status, 500);
    assert.equal(body.message, 'Internal server error');
    assert.ok(!JSON.stringify(body).includes('shopId'), 'internal identifiers must not travel');
  });

  it('withholds the internals of a Prisma initialisation failure', () => {
    // Neither `PrismaClientKnownRequestError` (no `code`) nor
    // `PrismaClientValidationError`, so this is the branch that used to fall
    // through to `instanceof Error`.
    const err = new Prisma.PrismaClientInitializationError(
      "Can't reach database server at `127.0.0.1:15432`",
      'test',
      'P1001',
    );
    const { status, body } = through(err);

    assert.equal(status, 500);
    assert.equal(body.message, 'Internal server error');
    assert.ok(!JSON.stringify(body).includes('127.0.0.1'), 'the database host must not travel');
  });

  it('withholds a non-Error throw', () => {
    const { status, body } = through({ secretKey: 'AKIA_not_a_real_key', note: 'thrown object' });

    assert.equal(status, 500);
    assert.equal(body.message, 'Internal server error');
    assert.ok(!JSON.stringify(body).includes('AKIA_not_a_real_key'), 'the thrown value must not travel');
  });

  it('keeps a deliberately-thrown 5xx message, which is written for the caller', () => {
    // `AuthService` answers an SMS gateway failure with a 503 whose sentence is
    // the one the seller should read. Withholding an unrecognised throw must not
    // silence an author-chosen one.
    const { status, body } = through(
      new InternalServerErrorException('We could not reach the payment gateway.'),
    );

    assert.equal(status, 500);
    assert.equal(body.message, 'We could not reach the payment gateway.');
  });
});
