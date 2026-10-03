import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDeliveryProofKey,
  buildDocumentKey,
  buildPublicKey,
  buildSupportAttachmentKey,
  checkUpload,
  declaredExtension,
  extensionFor,
  normaliseMime,
  safeDisplayName,
  sniffMime,
} from './upload-rules';

/**
 * These are the security rules of the upload path, so each one is tested as a
 * fact about bytes rather than through an HTTP request: a filter that is only
 * exercised end to end is a filter nobody can reason about.
 *
 * The buffers below are real file headers, not placeholders. A test that fed the
 * validator the string "png" would pass while the validator was broken.
 */
const jpeg = (extra = ''): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(extra)]);
const png = (): Buffer =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('IHDR')]);
const webp = (): Buffer => Buffer.concat([Buffer.from('RIFF'), Buffer.from([32, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const pdf = (): Buffer => Buffer.from('%PDF-1.7\n1 0 obj\n');

describe('sniffMime', () => {
  it('recognises the four types this platform accepts', () => {
    assert.equal(sniffMime(jpeg()), 'image/jpeg');
    assert.equal(sniffMime(png()), 'image/png');
    assert.equal(sniffMime(webp()), 'image/webp');
    assert.equal(sniffMime(pdf()), 'application/pdf');
  });

  it('returns null for anything else, including things that want to be run', () => {
    assert.equal(sniffMime(Buffer.from('<?php system($_GET["c"]); ?>')), null);
    assert.equal(sniffMime(Buffer.from('<svg onload="alert(1)"/>')), null);
    assert.equal(sniffMime(Buffer.from([0x4d, 0x5a, 0x90, 0x00])), null); // DOS/PE header
    assert.equal(sniffMime(Buffer.from('#!/bin/sh\nrm -rf /\n')), null);
    assert.equal(sniffMime(Buffer.from('GIF89a')), null); // real format, not allowed here
    assert.equal(sniffMime(Buffer.alloc(0)), null);
  });

  it('refuses a file that is a PDF only after some other content', () => {
    // Readers tolerate junk before %PDF-; accepting it would let one file be two
    // things depending on which program opened it.
    assert.equal(sniffMime(Buffer.concat([Buffer.from('<html>'), pdf()])), null);
  });

  it('does not mistake a truncated signature for a match', () => {
    assert.equal(sniffMime(Buffer.from([0xff, 0xd8])), null);
    assert.equal(sniffMime(Buffer.from('RIFF____')), null); // container, no WEBP form
  });
});

describe('names and types the client supplied', () => {
  it('normalises the spellings browsers actually send', () => {
    assert.equal(normaliseMime('IMAGE/JPG'), 'image/jpeg');
    assert.equal(normaliseMime('image/jpeg; charset=binary'), 'image/jpeg');
    assert.equal(normaliseMime('application/x-pdf'), 'application/pdf');
    assert.equal(normaliseMime(undefined), '');
  });

  it('reads the extension a filename claims, and nothing else', () => {
    assert.equal(declaredExtension('citizenship.JPG'), 'jpg');
    assert.equal(declaredExtension('my.scan.pdf'), 'pdf');
    assert.equal(declaredExtension('../../etc/passwd.png'), 'png');
    assert.equal(declaredExtension('noextension'), null);
    assert.equal(declaredExtension('.hidden'), null);
    assert.equal(declaredExtension('trailing.'), null);
  });

  it('reduces a filename to something safe to store and to echo', () => {
    assert.equal(safeDisplayName('../../etc/passwd'), 'passwd');
    assert.equal(safeDisplayName('C:\\Users\\me\\scan.pdf'), 'scan.pdf');
    assert.equal(safeDisplayName('quote".pdf'), 'quote.pdf');
    assert.equal(safeDisplayName('bad\u0000name.pdf'), 'badname.pdf');
    assert.equal(safeDisplayName('नागरिकता.jpg'), 'नागरिकता.jpg');
    assert.equal(safeDisplayName(''), 'upload');
    assert.equal(safeDisplayName('..'), 'upload');
    assert.equal(safeDisplayName(`${'a'.repeat(400)}.pdf`).length, 120);
  });

  it('maps each accepted type to one canonical extension', () => {
    assert.equal(extensionFor('image/jpeg'), 'jpg');
    assert.equal(extensionFor('image/png'), 'png');
    assert.equal(extensionFor('image/webp'), 'webp');
    assert.equal(extensionFor('application/pdf'), 'pdf');
  });
});

const MB = 1024 * 1024;

describe('checkUpload', () => {
  it('accepts a photographed citizenship card as a document', () => {
    const result = checkUpload(
      { buffer: jpeg('body'), originalName: 'नागरिकता front.jpg', declaredMime: 'image/jpeg' },
      'document',
      10 * MB,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.file.mime, 'image/jpeg');
    assert.equal(result.file.extension, 'jpg');
    assert.equal(result.file.displayName, 'नागरिकता front.jpg');
    assert.equal(result.file.size, jpeg('body').byteLength);
  });

  it('accepts a PDF as a document but not as a public image', () => {
    assert.equal(checkUpload({ buffer: pdf(), declaredMime: 'application/pdf' }, 'document', 10 * MB).ok, true);
    const asImage = checkUpload({ buffer: pdf(), declaredMime: 'application/pdf' }, 'image', 5 * MB);
    assert.equal(asImage.ok, false);
    if (asImage.ok) return;
    assert.equal(asImage.code, 'UNSUPPORTED_TYPE');
    assert.match(asImage.message, /JPEG, PNG or WebP image/);
  });

  it('rejects an oversized file on its length, and says both numbers', () => {
    const big = Buffer.concat([jpeg(), Buffer.alloc(2 * MB)]);
    const result = checkUpload({ buffer: big, declaredMime: 'image/jpeg' }, 'image', MB);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'TOO_LARGE');
    assert.match(result.message, /2\.0 MB/);
    assert.match(result.message, /limit is 1\.0 MB/);
  });

  it('rejects an empty file rather than storing a zero-byte document', () => {
    const result = checkUpload({ buffer: Buffer.alloc(0), originalName: 'a.pdf' }, 'document', 10 * MB);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'EMPTY');
  });

  it('rejects a file whose contents are not what it was sent as', () => {
    // The classic: a script named and declared as an image.
    const disguised = checkUpload(
      { buffer: Buffer.from('<?php system($_GET["c"]); ?>'), originalName: 'photo.jpg', declaredMime: 'image/jpeg' },
      'image',
      5 * MB,
    );
    assert.equal(disguised.ok, false);
    if (disguised.ok) return;
    assert.equal(disguised.code, 'UNSUPPORTED_TYPE');
  });

  it('rejects a real image sent under the wrong declared type', () => {
    const result = checkUpload({ buffer: png(), originalName: 'a.png', declaredMime: 'application/pdf' }, 'document', 10 * MB);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'CONTENT_MISMATCH');
    assert.match(result.message, /sent as application\/pdf but its contents are image\/png/);
  });

  it('rejects a real PDF wearing an image extension', () => {
    const result = checkUpload({ buffer: pdf(), originalName: 'scan.jpg' }, 'document', 10 * MB);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'CONTENT_MISMATCH');
    assert.match(result.message, /named "\.jpg" but its contents are application\/pdf/);
  });

  it('accepts a file with no extension and no declared type, if the bytes are right', () => {
    // Some Android browsers send neither. The bytes are the authority anyway.
    const result = checkUpload({ buffer: png(), originalName: 'scan' }, 'document', 10 * MB);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.file.extension, 'png');
    assert.equal(result.file.displayName, 'scan');
  });

  it('accepts .jpeg and .jpg as the same thing', () => {
    assert.equal(checkUpload({ buffer: jpeg(), originalName: 'a.jpeg' }, 'image', 5 * MB).ok, true);
    assert.equal(checkUpload({ buffer: jpeg(), originalName: 'a.JPG' }, 'image', 5 * MB).ok, true);
  });
});

describe('storage keys', () => {
  it('puts an application document under the private namespace, named after nothing the client sent', () => {
    const key = buildDocumentKey('clx0app0000000000000000', 'pdf');
    assert.match(key, /^private\/shop-applications\/clx0app0000000000000000\/[0-9a-f]{32}\.pdf$/);
  });

  it('puts a delivery proof under its own private namespace', () => {
    const key = buildDeliveryProofKey('clx0delivery000000000000', 'webp');
    assert.match(key, /^private\/delivery-proofs\/clx0delivery000000000000\/[0-9a-f]{32}\.webp$/);
  });

  it('puts support evidence under a private, ticket-scoped namespace', () => {
    assert.match(buildSupportAttachmentKey('ticket_1', 'pdf'), /^private\/support-tickets\/ticket_1\/[0-9a-f]{32}\.pdf$/);
    assert.throws(() => buildSupportAttachmentKey('../other', 'pdf'), /unsafe ticket id/);
  });

  it('puts a public image under the public namespace, under the segments it was given', () => {
    const key = buildPublicKey(['shops', 'clx0shop000000000000000', 'products'], 'jpg');
    assert.match(key, /^public\/shops\/clx0shop000000000000000\/products\/[0-9a-f]{32}\.jpg$/);
  });

  it('never produces the same key twice', () => {
    const keys = new Set(Array.from({ length: 200 }, () => buildDocumentKey('app1', 'jpg')));
    assert.equal(keys.size, 200);
  });

  it('refuses to build a key out of anything that could escape the namespace', () => {
    // Every one of these would be a traversal or a namespace escape if it landed
    // in the string, so the function refuses rather than sanitising: a caller
    // passing '..' has a bug, and quietly rewriting it would hide the bug.
    assert.throws(() => buildDocumentKey('..', 'pdf'), /unsafe application id/);
    assert.throws(() => buildDocumentKey('a/../../b', 'pdf'), /unsafe application id/);
    assert.throws(() => buildDocumentKey('app 1', 'pdf'), /unsafe application id/);
    assert.throws(() => buildDocumentKey('', 'pdf'), /unsafe application id/);
    assert.throws(() => buildDocumentKey('app1', '../sh'), /unsafe extension/);
    assert.throws(() => buildDeliveryProofKey('../order', 'jpg'), /unsafe delivery id/);
    assert.throws(() => buildPublicKey(['shops', '..'], 'jpg'), /unsafe key segment/);
    assert.throws(() => buildPublicKey(['shops/../..'], 'jpg'), /unsafe key segment/);
    assert.throws(() => buildPublicKey([], 'jpg'), /no path/);
  });

  it('refuses an id long enough to be something other than an id', () => {
    assert.throws(() => buildDocumentKey('a'.repeat(65), 'pdf'), /unsafe application id/);
  });

  it('takes the extension from the sniffed type, so a hostile filename cannot reach the key', () => {
    // The end-to-end version of the rule: what the client called the file has no
    // influence on where it is stored or what it is stored as.
    const accepted = checkUpload(
      { buffer: png(), originalName: '../../etc/cron.d/evil', declaredMime: 'image/png' },
      'document',
      10 * MB,
    );
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    const key = buildDocumentKey('app1', accepted.file.extension);
    assert.match(key, /^private\/shop-applications\/app1\/[0-9a-f]{32}\.png$/);
    assert.ok(!key.includes('..'));
    assert.ok(!key.includes('etc'));
    assert.equal(accepted.file.displayName, 'evil');
  });
});
