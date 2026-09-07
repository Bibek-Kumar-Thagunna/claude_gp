import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import { contentDisposition, sendDocument } from './send-document';

/**
 * These two functions are the only place a KYC scan crosses from our storage
 * into a browser, so what is asserted here is the set of headers that stops the
 * browser from treating user-supplied bytes as our own content — plus the one
 * piece of string handling that could otherwise be used to inject a header.
 */

/** Records what was set, without pulling in express. */
function fakeResponse(): {
  res: Response;
  headers: Record<string, string | number>;
  body: () => Buffer | undefined;
} {
  const headers: Record<string, string | number> = {};
  let body: Buffer | undefined;
  const res = {
    setHeader: (name: string, value: string | number) => {
      headers[name] = value;
    },
    end: (chunk: Buffer) => {
      body = chunk;
    },
  } as unknown as Response;
  return { res, headers, body: () => body };
}

describe('contentDisposition', () => {
  it('always says attachment, so nothing is ever rendered in our origin', () => {
    assert.match(contentDisposition('scan.pdf'), /^attachment; /);
  });

  it('sends both an ASCII fallback and a UTF-8 form', () => {
    assert.equal(
      contentDisposition('scan.pdf'),
      'attachment; filename="scan.pdf"; filename*=UTF-8\'\'scan.pdf',
    );
  });

  it('keeps a Nepali filename intact in the UTF-8 form', () => {
    const header = contentDisposition('नागरिकता.jpg');
    // The ASCII fallback cannot carry Devanagari, so it degrades to the extension.
    assert.match(header, /filename="\.jpg"|filename="jpg"/);
    assert.ok(header.includes(`filename*=UTF-8''${encodeURIComponent('नागरिकता.jpg')}`));
    assert.ok(!header.includes('नागरिकता'), 'raw non-ASCII bytes must not reach the header');
  });

  it('cannot be used to break out of the header', () => {
    for (const hostile of [
      'a";\r\nX-Injected: 1\r\n\r\n.jpg',
      'a"; filename="b.exe',
      'back\\slash.jpg',
      'new\nline.jpg',
    ]) {
      const header = contentDisposition(hostile);
      const quoted = /filename="([^"]*)"/.exec(header);
      assert.ok(quoted, 'the ASCII form should still be present');
      assert.ok(!/["\\\r\n]/.test(quoted[1] ?? ''), 'the quoted form must be free of quotes and CR/LF');
      // `filename*` is percent-encoded, so CR/LF cannot survive there either.
      assert.ok(!/[\r\n]/.test(header));
    }
  });

  it('falls back to a name rather than emitting an empty one', () => {
    assert.match(contentDisposition(''), /filename="document"/);
    assert.match(contentDisposition('___'), /filename="document"/);
    assert.match(contentDisposition('नागरिकता'), /filename="document"/);
  });

  it('bounds the ASCII form, because a filename is not a place to put a megabyte', () => {
    const header = contentDisposition(`${'a'.repeat(500)}.jpg`);
    const quoted = /filename="([^"]*)"/.exec(header);
    assert.equal(quoted?.[1]?.length, 80);
  });
});

describe('sendDocument', () => {
  const doc = { buffer: Buffer.from('scan bytes'), mimeType: 'image/jpeg', fileName: 'front.jpg' };

  it('writes the sniffed type, the length and the bytes', () => {
    const { res, headers, body } = fakeResponse();
    sendDocument(res, doc);

    assert.equal(headers['Content-Type'], 'image/jpeg');
    assert.equal(headers['Content-Length'], doc.buffer.byteLength);
    assert.deepEqual(body(), doc.buffer);
  });

  it('sets every header that keeps a KYC scan out of caches and out of our origin', () => {
    const { res, headers } = fakeResponse();
    sendDocument(res, doc);

    assert.match(String(headers['Content-Disposition']), /^attachment; /);
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Content-Security-Policy'], "default-src 'none'; sandbox");
    assert.equal(headers['Cache-Control'], 'no-store, private');
  });

  it('does not let a PDF be served as anything renderable by accident', () => {
    const { res, headers } = fakeResponse();
    sendDocument(res, { ...doc, mimeType: 'application/pdf', fileName: 'licence.pdf' });
    assert.equal(headers['Content-Type'], 'application/pdf');
    assert.match(String(headers['Content-Disposition']), /attachment/);
  });
});
