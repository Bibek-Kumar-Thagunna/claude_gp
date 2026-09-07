import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4 for a single S3 request, written directly against the
 * published algorithm rather than pulled in as an SDK dependency.
 *
 * Why by hand: the only S3 operations GoPasal performs are PutObject and
 * DeleteObject, SigV4 is a stable and fully specified algorithm, and this keeps
 * the API's dependency list — the thing that has to be audited before a
 * production deploy — one package shorter. It is also what lets the *same* code
 * path talk to MinIO locally and to S3/R2/Spaces in production: the difference
 * is a hostname and a region, not a library.
 *
 * Verified in aws-sigv4.spec.ts against the canonical request AWS publishes for
 * its worked PutObject example, with the signature cross-checked by a separate
 * derivation — so this is not "probably correct by inspection".
 */
export interface SignInput {
  method: string;
  /** Full request URL, including any query string. */
  url: string;
  region: string;
  service: string;
  accessKey: string;
  secretKey: string;
  /** Raw request body. Empty for GET/DELETE. */
  payload: Buffer | string;
  /** Extra headers to sign, e.g. Content-Type. Host is added automatically. */
  headers?: Record<string, string>;
  /** Overridable for tests; defaults to now. */
  now?: Date;
}

const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string): Buffer => createHmac('sha256', key).update(data).digest();

/** 20260823T041500Z / 20260823 — the two timestamp forms SigV4 uses. */
function stamps(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/**
 * URI-encode a path segment the way S3 expects: RFC 3986 unreserved characters
 * stay, everything else is percent-encoded, and `/` separators are preserved.
 * `encodeURIComponent` leaves !'()* alone, which S3 does not, hence the tail.
 */
export function encodeS3Path(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}

/**
 * The intermediate values SigV4 is defined in terms of. Exposed because they are
 * what the algorithm can actually be *tested* against: AWS publishes the
 * canonical request for its worked examples, and every signing bug shows up as a
 * difference in that text long before it shows up as a wrong hex string.
 */
export interface SignatureParts {
  canonicalRequest: string;
  stringToSign: string;
  signedHeaders: string;
  signature: string;
  /** Headers to send, including Authorization. */
  headers: Record<string, string>;
}

/** Build every intermediate value, then the signature. */
export function signatureParts(input: SignInput): SignatureParts {
  const url = new URL(input.url);
  const { amzDate, dateStamp } = stamps(input.now ?? new Date());
  const payloadHash = sha256(input.payload);

  // Host must be signed; the port is part of it for MinIO on localhost:9100.
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  for (const [k, v] of Object.entries(input.headers ?? {})) {
    headers[k.toLowerCase()] = v.trim().replace(/\s+/g, ' ');
  }

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');

  // Query parameters are sorted by name, then value, and encoded individually.
  const query = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const canonicalRequest = [
    input.method.toUpperCase(),
    encodeS3Path(decodeURIComponent(url.pathname)),
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretKey}`, dateStamp), input.region), input.service),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    canonicalRequest,
    stringToSign,
    signedHeaders,
    signature,
    headers: {
      ...input.headers,
      Host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/**
 * Returns the headers to send, including Authorization. The caller sends the
 * request itself — signing and transport stay separate so each can be tested
 * without the other.
 */
export function signRequest(input: SignInput): Record<string, string> {
  return signatureParts(input).headers;
}

