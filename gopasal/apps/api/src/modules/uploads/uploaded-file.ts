/**
 * The shape multer hands to a handler, written out by hand.
 *
 * `@types/multer` is not a dependency of this workspace, so the `Express.Multer`
 * namespace does not exist and `Express.Multer.File` will not compile. multer
 * itself IS present (as a dependency of `@nestjs/platform-express`, which is what
 * `FileInterceptor` uses), so the runtime object below is real — this declaration
 * simply describes it without adding a package for four fields.
 *
 * Only the memory-storage fields are declared as always-present. `FileInterceptor`
 * is used without a `storage` or `dest` option, which is what makes multer buffer
 * the file in memory: nothing in this application ever wants a half-validated file
 * sitting in a temp directory under a name a client influenced. `destination`,
 * `filename` and `path` are therefore optional and are never read.
 */
export interface UploadedFile {
  /** The form field the file arrived under. */
  fieldname: string;
  /** The filename the client sent. Untrusted: sanitise before storing or echoing. */
  originalname: string;
  encoding: string;
  /** The Content-Type the client declared. Untrusted: verified against the bytes. */
  mimetype: string;
  /** Byte length, as multer counted it. Cross-checked against `buffer.byteLength`. */
  size: number;
  /** Present with memory storage, which is the only configuration used here. */
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}

/**
 * Multer populates `req.file` only when a part with the expected field name
 * arrives, so a request with no file at all reaches the handler with `undefined`.
 * Every upload handler therefore starts by asking for the file it was promised.
 */
export function hasBuffer(file: UploadedFile | undefined): file is UploadedFile {
  return file !== undefined && Buffer.isBuffer(file.buffer);
}
