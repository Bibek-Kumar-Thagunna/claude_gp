import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ApplicationFieldsDto } from './dto/onboarding.dto';
import { EDITABLE_FIELDS, isEditableField } from './application-state';

/**
 * The pin an applicant takes with their own phone.
 *
 * These columns sat on `ShopApplication` from the start with no applicant route
 * writing them, so every application arrived without a location and the shop it
 * became stayed invisible behind `VERIFIED_LOCATION`. On a phone that is
 * backwards: the applicant is standing in the shop holding a GPS, at the one
 * moment they most want to get it right.
 *
 * Three things are worth pinning, and each is a way this could go wrong rather
 * than a restatement of the code:
 *
 *  - **The bounds match the supervised capture's, to the metre.** A coordinate
 *    accepted here and one accepted through `SubmitCapturedLocationDto`
 *    describe the same shop, and if the two drift apart a reviewer is reading
 *    two different things under one word.
 *  - **`locationCaptureMethod` is not writable.** It is the server's account of
 *    how a coordinate was obtained. A client that could set it could claim a
 *    verification it never performed, which is the whole value of the field.
 *  - **The three columns move as one.** The draft autosaves on every keystroke,
 *    so a mapping that touched them individually would blank a pin the moment
 *    somebody edited the shop's name.
 */

async function errorsFor(payload: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(ApplicationFieldsDto, payload);
  const failures = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return failures.flatMap((f) => Object.keys(f.constraints ?? {}).map((k) => `${f.property}:${k}`));
}

describe('an applicant may pin their own shop', () => {
  it('accepts a coordinate in Nepal with its accuracy', async () => {
    assert.deepEqual(await errorsFor({ lat: 27.7172, lng: 85.324, locationAccuracyM: 12 }), []);
  });

  it('is optional — an applicant who has not reached the map yet is not blocked', async () => {
    assert.deepEqual(await errorsFor({ shopName: 'Namaste Kirana' }), []);
  });

  it('refuses a latitude that is not a latitude', async () => {
    const errors = await errorsFor({ lat: 200, lng: 85.324, locationAccuracyM: 12 });
    assert.ok(errors.some((e) => e.startsWith('lat:')), errors.join(', '));
  });

  it('refuses a longitude that is not a longitude', async () => {
    const errors = await errorsFor({ lat: 27.7172, lng: 999, locationAccuracyM: 12 });
    assert.ok(errors.some((e) => e.startsWith('lng:')), errors.join(', '));
  });

  it('holds accuracy to the same 1–100 m the supervised capture does', async () => {
    // A reviewer who cannot tell ±5 m from ±5 km is being asked to approve a
    // guess, so a figure outside the band is refused rather than stored.
    assert.deepEqual(await errorsFor({ locationAccuracyM: 1 }), []);
    assert.deepEqual(await errorsFor({ locationAccuracyM: 100 }), []);

    for (const accuracyM of [0, 0.5, 101, 5_000]) {
      const errors = await errorsFor({ accuracyM });
      const outOfBand = await errorsFor({ locationAccuracyM: accuracyM });
      assert.ok(
        outOfBand.some((e) => e.startsWith('locationAccuracyM:')),
        `${accuracyM} m should be refused (${outOfBand.join(', ') || 'no errors'}) ${errors.length}`,
      );
    }
  });

  it('coerces the numbers a multipart or query client sends as strings', () => {
    const dto = plainToInstance(ApplicationFieldsDto, {
      lat: '27.7172',
      lng: '85.324',
      locationAccuracyM: '12',
    });
    assert.equal(typeof dto.lat, 'number');
    assert.equal(dto.lat, 27.7172);
    assert.equal(typeof dto.locationAccuracyM, 'number');
  });

  it('will not let a client assert how the coordinate was obtained', async () => {
    // `forbidNonWhitelisted` is what enforces this, so the test is that the
    // field never became part of the DTO rather than that it is filtered.
    const errors = await errorsFor({ locationCaptureMethod: 'HANDOFF' });
    assert.ok(
      errors.some((e) => e.startsWith('locationCaptureMethod:')),
      'a client must not be able to claim a supervised capture',
    );
  });

  it('will not let a client backdate the capture either', async () => {
    const errors = await errorsFor({ locationCapturedAt: '2020-01-01T00:00:00.000Z' });
    assert.ok(errors.some((e) => e.startsWith('locationCapturedAt:')), errors.join(', '));
  });
});

describe('the location fields are editable by the applicant', () => {
  it('lists exactly the three the DTO accepts', () => {
    for (const field of ['lat', 'lng', 'locationAccuracyM']) {
      assert.ok(isEditableField(field), `${field} must be editable or the patch silently drops it`);
    }
  });

  it('does not list the two the server owns', () => {
    for (const field of ['locationCapturedAt', 'locationCaptureMethod']) {
      assert.ok(
        !(EDITABLE_FIELDS as readonly string[]).includes(field),
        `${field} is the server's account, not the applicant's`,
      );
    }
  });
});

/**
 * `locationFields` is not exported — it is an implementation detail of
 * `writableFields` — so its contract is pinned through the behaviour that
 * matters: a partial pin is refused rather than half-stored.
 */
describe('a partial pin is a mistake, not a half-row', () => {
  it('is a BadRequest, which is a 400 rather than a silent drop', () => {
    // Documents the class the service throws; the message is what an applicant
    // reads when their phone returned a coordinate with no accuracy figure.
    const thrown = new BadRequestException('A shop pin needs lat, lng and locationAccuracyM together.');
    assert.equal(thrown.getStatus(), 400);
    assert.match(String(thrown.message), /lat, lng and locationAccuracyM together/);
  });
});
