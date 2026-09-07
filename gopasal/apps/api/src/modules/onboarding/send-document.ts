import type { Response } from 'express';
import type { DocumentDownload } from './documents.service';

/**
 * Write a private document to the response.
 *
 * This exists as a function rather than as a returned value because
 * `SanitizeInterceptor` rebuilds every response object it sees, which would
 * reduce a `Buffer` to whatever a recursive walk makes of one. A handler that
 * writes to `@Res()` bypasses the serialisation pipeline entirely, which is what
 * a byte stream needs.
 *
 * The headers are the point of the file. A KYC scan is user-supplied content
 * served back from our own origin, so:
 *
 *   - `Content-Type` is the type we sniffed at upload, never the client's claim;
 *   - `nosniff` stops a browser from second-guessing that type;
 *   - `Content-Disposition: attachment` means even a type that *is* renderable is
 *     downloaded rather than run in our origin's context;
 *   - a `default-src 'none'; sandbox` CSP neuters anything that gets rendered
 *     anyway, which is the same policy the static handler in main.ts applies;
 *   - `no-store` keeps citizenship cards out of the shared caches and off the
 *     disk of the reviewer's browser.
 */
export function sendDocument(res: Response, doc: DocumentDownload): void {
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Length', doc.buffer.byteLength);
  res.setHeader('Content-Disposition', contentDisposition(doc.fileName));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'no-store, private');
  res.end(doc.buffer);
}

/**
 * `attachment` with a filename a browser will accept, built so that no stored
 * name can break out of the header.
 *
 * Two forms are sent, as RFC 6266 recommends: a quoted ASCII fallback for old
 * clients, and `filename*` in RFC 5987 percent-encoded UTF-8 so that a Nepali
 * filename — which is the normal case here — survives. The ASCII form is reduced
 * to a conservative character set rather than escaped, because the only thing a
 * fallback needs to be is safe and recognisable.
 */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'document';
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${ascii.slice(0, 80)}"; filename*=UTF-8''${encoded}`;
}
