import type { Response } from 'express';
import type { DeliveryProofDownload } from '../uploads/uploads.service';

/** Send a private, authenticated proof image without allowing shared caching. */
export function sendDeliveryProof(res: Response, proof: DeliveryProofDownload): void {
  res.setHeader('Content-Type', proof.mimeType);
  res.setHeader('Content-Length', proof.buffer.byteLength);
  res.setHeader('Content-Disposition', `inline; filename="${proof.fileName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'no-store, private');
  res.end(proof.buffer);
}
