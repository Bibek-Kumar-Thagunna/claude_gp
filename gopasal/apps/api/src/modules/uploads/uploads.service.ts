import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { STORAGE_PROVIDER, type StorageProvider } from '../../providers/storage.provider';
import { MALWARE_SCANNER, type MalwareScanner } from '../../providers/malware-scanner.provider';
import {
  type AcceptedUpload,
  type UploadPurpose,
  buildDeliveryProofKey,
  buildDocumentKey,
  buildPublicKey,
  buildSupportAttachmentKey,
  checkUpload,
  sniffMime,
} from './upload-rules';
import { type UploadedFile, hasBuffer } from './uploaded-file';

/** What was actually persisted: the accepted facts about the file plus its key. */
export interface StoredUpload extends AcceptedUpload {
  /** The storage key. The database stores this, never a path or a URL. */
  key: string;
  /** Fetchable without a credential, or `null` for a private object. */
  url: string | null;
}

export interface DeliveryProofDownload {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileName: string;
}

const DELIVERY_PROOF_KEY =
  /^private\/delivery-proofs\/([A-Za-z0-9_-]{1,64})\/([a-f0-9]{32})\.(jpg|png|webp)$/;
const DELIVERY_PROOF_MIME = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

/**
 * The one place bytes enter the system.
 *
 * Its job is narrow on purpose: validate, name, persist, and report what was
 * actually stored. It knows nothing about applications, shops or permissions —
 * callers decide who may upload and what the file is for, and this service
 * guarantees only that whatever it returns is really on disk (or in the bucket)
 * under the key it names.
 *
 * `checkUpload` runs before a single byte is handed to the storage provider, and
 * the key is generated here rather than derived from the client's filename, so
 * neither the validation nor the path can be influenced by the request.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  /** The configured ceiling for this kind of upload, in bytes. */
  maxBytes(purpose: UploadPurpose): number {
    const uploads = this.config.get('uploads', { infer: true });
    return purpose === 'image' ? uploads.maxImageBytes : uploads.maxDocumentBytes;
  }

  /**
   * Validate against the rules for `purpose`, or throw the exception that names
   * what the person needs to change. Nothing is stored by this method. The buffer
   * is returned alongside the verdict so callers never have to re-narrow the
   * possibly-absent file.
   */
  private async accept(
    file: UploadedFile | undefined,
    purpose: UploadPurpose,
  ): Promise<{ accepted: AcceptedUpload; buffer: Buffer }> {
    if (!hasBuffer(file)) {
      throw new BadRequestException('No file was uploaded. Attach it as the "file" field.');
    }
    const result = checkUpload(
      { buffer: file.buffer, originalName: file.originalname, declaredMime: file.mimetype },
      purpose,
      this.maxBytes(purpose),
    );
    if (!result.ok) {
      // 413 for size so a client can tell "too big" from "wrong kind" without
      // parsing the message; everything else is the request's fault in the same way.
      if (result.code === 'TOO_LARGE') throw new PayloadTooLargeException(result.message);
      throw new BadRequestException(result.message);
    }
    await this.scanner.scan(file.buffer);
    return { accepted: result.file, buffer: file.buffer };
  }

  /**
   * Store a KYC or registration document for an application. The returned key is
   * private: there is no URL for it, and the only way back to the bytes is
   * `read()` behind an endpoint that has checked the caller.
   */
  async storeApplicationDocument(
    applicationId: string,
    file: UploadedFile | undefined,
  ): Promise<StoredUpload> {
    const { accepted, buffer } = await this.accept(file, 'document');
    const key = buildDocumentKey(applicationId, accepted.extension);
    const stored = await this.storage.save(key, buffer, accepted.mime);
    // Type and size are logged; the filename, the bytes and the person are not. A
    // KYC upload is exactly the wrong thing to leave a trail of in a log file.
    this.logger.log(`stored document ${stored.key} (${accepted.mime}, ${accepted.size} bytes)`);
    return { key: stored.key, url: stored.url, ...accepted };
  }

  /** Store a private proof-of-delivery photograph. */
  async storeDeliveryProof(deliveryId: string, file: UploadedFile | undefined): Promise<StoredUpload> {
    const { accepted, buffer } = await this.accept(file, 'image');
    const key = buildDeliveryProofKey(deliveryId, accepted.extension);
    const stored = await this.storage.save(key, buffer, accepted.mime);
    this.logger.log(`stored delivery proof ${deliveryId} (${accepted.mime}, ${accepted.size} bytes)`);
    return { key: stored.key, url: null, ...accepted };
  }

  async storeSupportAttachment(ticketId: string, file: UploadedFile | undefined): Promise<StoredUpload> {
    const { accepted, buffer } = await this.accept(file, 'document');
    const key = buildSupportAttachmentKey(ticketId, accepted.extension);
    const stored = await this.storage.save(key, buffer, accepted.mime);
    this.logger.log(`stored support attachment ${ticketId} (${accepted.mime}, ${accepted.size} bytes)`);
    return { key: stored.key, url: null, ...accepted };
  }

  async readSupportAttachment(ticketId: string, key: string, mimeType: string, fileName: string, sizeBytes: number) {
    const match = /^private\/support-tickets\/([A-Za-z0-9_-]{1,64})\/[a-f0-9]{32}\.(jpg|png|webp|pdf)$/.exec(key);
    const allowed = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' } as const;
    if (!match || match[1] !== ticketId || allowed[match[2] as keyof typeof allowed] !== mimeType) {
      throw new BadRequestException('Invalid support attachment reference');
    }
    const buffer = await this.storage.read(key);
    if (buffer.byteLength !== sizeBytes || sniffMime(buffer) !== mimeType) {
      this.logger.error(`support attachment ${ticketId} failed its stored-content check`);
      throw new BadRequestException('The stored attachment does not match its recorded type');
    }
    return { buffer, mimeType, fileName };
  }

  /**
   * Read one proof from the only private namespace accepted for delivery images.
   * The delivery id embedded by the key builder must match the authorised row,
   * and the bytes are sniffed again before they leave storage. This prevents a
   * corrupt or malicious database value from turning this endpoint into a reader
   * for a KYC document or another delivery's evidence.
   */
  async readDeliveryProof(deliveryId: string, key: string): Promise<DeliveryProofDownload> {
    const match = DELIVERY_PROOF_KEY.exec(key);
    if (!match || match[1] !== deliveryId) {
      throw new BadRequestException('Invalid delivery proof reference');
    }
    const extension = match[3] as keyof typeof DELIVERY_PROOF_MIME;
    const mimeType = DELIVERY_PROOF_MIME[extension];
    const buffer = await this.storage.read(key);
    if (sniffMime(buffer) !== mimeType) {
      this.logger.error(`delivery proof ${deliveryId} failed its stored-content check`);
      throw new BadRequestException('The stored delivery proof is not a valid image');
    }
    return { buffer, mimeType, fileName: `delivery-proof-${deliveryId}.${extension}` };
  }

  /**
   * Store something meant to be publicly fetchable — a product photo, a shop
   * front. `segments` becomes the path under `public/`, so it must be made of
   * identifiers the application controls, not of user input.
   */
  async storePublicImage(segments: string[], file: UploadedFile | undefined): Promise<StoredUpload> {
    const { accepted, buffer } = await this.accept(file, 'image');
    const key = buildPublicKey(segments, accepted.extension);
    const stored = await this.storage.save(key, buffer, accepted.mime);
    return { key: stored.key, url: stored.url, ...accepted };
  }

  /**
   * The bytes back. Throws NotFoundException when the row outlived the object,
   * which is the storage provider's contract — a download endpoint must never be
   * able to serve an empty file as though it were a document.
   */
  read(key: string): Promise<Buffer> {
    return this.storage.read(key);
  }

  /** Best-effort delete. An object that is already gone is the desired state. */
  async remove(key: string): Promise<void> {
    await this.storage.remove(key);
  }

  /** Which implementation is live, for the boot log and for support questions. */
  get providerName(): string {
    return this.storage.name;
  }
}
