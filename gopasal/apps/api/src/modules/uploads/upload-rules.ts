import { randomBytes } from 'node:crypto';
import { PRIVATE_PREFIX, PUBLIC_PREFIX } from '../../providers/storage.provider';

/**
 * Everything that decides whether a byte stream is allowed in, and what it will
 * be called once it is. Deliberately free of Nest and of the database: these are
 * pure functions over a Buffer and a filename, which is what makes the security
 * rules testable one at a time rather than only through an HTTP request.
 *
 * Three separate facts about an upload are compared before it is accepted:
 *
 *   1. the Content-Type the client declared,
 *   2. the extension on the filename the client sent,
 *   3. the magic bytes actually at the start of the buffer.
 *
 * Any disagreement is a rejection. A PDF renamed to `.jpg` is usually a mistake;
 * an executable renamed to `.jpg` is not, and neither case should reach storage.
 * The extension the object is finally stored under comes from (3) alone — the
 * client's filename never decides anything about the key.
 */

/** What a public asset may be: a photograph, in a format every browser renders. */
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * What a KYC document may be. The same three image types, because a citizenship
 * card is usually photographed with a phone rather than scanned, plus PDF for the
 * multi-page registration papers a registered business will have.
 */
export const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'] as const;

export type AllowedMime = (typeof DOCUMENT_MIME_TYPES)[number];

/** Which allow-list applies. Also selects the size ceiling, in the service. */
export type UploadPurpose = 'document' | 'image';

export const ALLOWED_MIME: Record<UploadPurpose, readonly AllowedMime[]> = {
  document: DOCUMENT_MIME_TYPES,
  image: IMAGE_MIME_TYPES,
};

/** The canonical extension for each type. The only source of a stored key's suffix. */
const CANONICAL_EXTENSION: Record<AllowedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Extensions a client may legitimately send, mapped to the type they mean. */
const EXTENSION_MEANS: Record<string, AllowedMime> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/** Spellings browsers and phone keyboards produce for a type we accept. */
const MIME_ALIASES: Record<string, AllowedMime> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'application/x-pdf': 'application/pdf',
};

export function extensionFor(mime: AllowedMime): string {
  return CANONICAL_EXTENSION[mime];
}

/** Normalise a declared Content-Type: lower-cased, parameters dropped, aliased. */
export function normaliseMime(declared: string | undefined): string {
  const bare = (declared ?? '').split(';')[0].trim().toLowerCase();
  return MIME_ALIASES[bare] ?? bare;
}

/**
 * What the bytes actually are, or `null` for anything not on the list. Only the
 * signatures of the four accepted types are recognised, so this doubles as the
 * content check: an unrecognised file cannot be identified and is therefore
 * refused, rather than being trusted because its name looked harmless.
 */
export function sniffMime(data: Buffer): AllowedMime | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  // RIFF container whose form type is WEBP; the four bytes between are the size.
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  // Required at offset 0 by the PDF specification. Readers tolerate junk in front
  // of it; accepting that here would let a file be two things at once.
  if (data.length >= 5 && data.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** The extension a client-supplied filename claims, lower-cased, without the dot. */
export function declaredExtension(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

/**
 * A filename fit to store in the `fileName` column and to put in a
 * Content-Disposition header — never in a storage key. Path segments are dropped
 * (`../../etc/passwd` becomes `passwd`), quotes and control characters go, and
 * the length is bounded. Nepali names survive, because sellers use them.
 */
export function safeDisplayName(original: string | undefined): string {
  const base = (original ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return 'upload';
  return cleaned.slice(0, 120);
}

/** Why an upload was refused. The service maps each code to an HTTP status. */
export type RejectionCode = 'EMPTY' | 'TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'CONTENT_MISMATCH';

export interface AcceptedUpload {
  /** The type the bytes actually are — not what the client said. */
  mime: AllowedMime;
  /** Canonical extension for that type; the only suffix a key ever gets. */
  extension: string;
  size: number;
  /** Sanitised, for the database column and Content-Disposition only. */
  displayName: string;
}

export type UploadCheck =
  | { ok: true; file: AcceptedUpload }
  | { ok: false; code: RejectionCode; message: string };

export interface CandidateUpload {
  buffer: Buffer;
  originalName?: string;
  declaredMime?: string;
}

const humanBytes = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/**
 * The gate. Ordered cheapest-first so a 50 MB body is rejected on its length
 * before anything inspects it, and so the message an applicant sees names the one
 * thing they can fix.
 */
export function checkUpload(
  candidate: CandidateUpload,
  purpose: UploadPurpose,
  maxBytes: number,
): UploadCheck {
  const { buffer } = candidate;
  if (buffer.byteLength === 0) {
    return { ok: false, code: 'EMPTY', message: 'That file is empty. Please choose the file again.' };
  }
  if (buffer.byteLength > maxBytes) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `That file is ${humanBytes(buffer.byteLength)}; the limit is ${humanBytes(maxBytes)}.`,
    };
  }

  const allowed = ALLOWED_MIME[purpose];
  const readable =
    purpose === 'image' ? 'a JPEG, PNG or WebP image' : 'a JPEG, PNG or WebP image, or a PDF';

  // What the bytes are. Anything unrecognised stops here, so no unknown format
  // reaches storage on the strength of its filename.
  const sniffed = sniffMime(buffer);
  if (sniffed === null || !allowed.includes(sniffed)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_TYPE',
      message: `That file is not ${readable}. Please upload ${readable}.`,
    };
  }

  // What the client said it was. A declared type outside the allow-list is a
  // rejection even when the bytes are fine: the two disagreeing means one of them
  // is wrong, and guessing which is how a filter gets bypassed.
  const declared = normaliseMime(candidate.declaredMime);
  if (declared !== '' && declared !== sniffed) {
    return {
      ok: false,
      code: 'CONTENT_MISMATCH',
      message: `That file was sent as ${declared} but its contents are ${sniffed}. Please upload it again.`,
    };
  }

  // What the filename claimed. Only checked when there is an extension to check;
  // it changes nothing about the stored key, but a mismatch means the file the
  // reviewer downloads would open under a misleading name.
  const ext = declaredExtension(candidate.originalName ?? '');
  if (ext !== null && EXTENSION_MEANS[ext] !== sniffed) {
    return {
      ok: false,
      code: 'CONTENT_MISMATCH',
      message: `That file is named ".${ext}" but its contents are ${sniffed}. Please upload it again.`,
    };
  }

  return {
    ok: true,
    file: {
      mime: sniffed,
      extension: extensionFor(sniffed),
      size: buffer.byteLength,
      displayName: safeDisplayName(candidate.originalName),
    },
  };
}

/**
 * Identifiers that may appear in a key. Every one of these comes from the
 * database (a cuid) rather than from a request body, but the check costs nothing
 * and it is the difference between a bug and a traversal if that ever changes.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function assertIdSegment(value: string, what: string): string {
  if (!ID_PATTERN.test(value)) throw new Error(`Refusing to build a storage key from an unsafe ${what}: "${value}"`);
  return value;
}

/**
 * 128 bits of randomness in the filename. Not for secrecy — private objects are
 * behind an authorised endpoint, not behind an unguessable name — but so that two
 * uploads never collide and so a public product image URL cannot be walked by
 * incrementing a number.
 */
function randomStem(): string {
  return randomBytes(16).toString('hex');
}

/**
 * The key for a KYC document. `private/` is not a suggestion: it is what keeps the
 * object out of the statically served tree and what makes `publicUrl()` refuse.
 * The extension comes from the sniffed type; the applicant's filename is nowhere
 * in this string.
 */
export function buildDocumentKey(applicationId: string, extension: string): string {
  assertIdSegment(applicationId, 'application id');
  assertIdSegment(extension, 'extension');
  return `${PRIVATE_PREFIX}shop-applications/${applicationId}/${randomStem()}.${extension}`;
}

/**
 * A doorstep proof photo is evidence, not a public catalogue asset. Keep it in
 * the private tree and name it only from the database-owned delivery id plus
 * random bytes. It can then be served solely by an endpoint that re-checks the
 * order relationship on every read.
 */
export function buildDeliveryProofKey(deliveryId: string, extension: string): string {
  assertIdSegment(deliveryId, 'delivery id');
  assertIdSegment(extension, 'extension');
  return `${PRIVATE_PREFIX}delivery-proofs/${deliveryId}/${randomStem()}.${extension}`;
}

/** Server-owned, private evidence for a support conversation. */
export function buildSupportAttachmentKey(ticketId: string, extension: string): string {
  assertIdSegment(ticketId, 'ticket id');
  assertIdSegment(extension, 'extension');
  return `${PRIVATE_PREFIX}support-tickets/${ticketId}/${randomStem()}.${extension}`;
}

/**
 * The key for something meant to be fetched without a credential — a product
 * photo, a shop front. Segments are validated individually, so a caller cannot
 * smuggle a `..` or a second prefix through one of them.
 */
export function buildPublicKey(segments: string[], extension: string): string {
  assertIdSegment(extension, 'extension');
  const path = segments.map((s) => assertIdSegment(s, 'key segment')).join('/');
  if (path === '') throw new Error('Refusing to build a storage key with no path');
  return `${PUBLIC_PREFIX}${path}/${randomStem()}.${extension}`;
}
