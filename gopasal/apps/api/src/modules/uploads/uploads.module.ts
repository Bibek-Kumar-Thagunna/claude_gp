import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';

/**
 * Exports `UploadsService` and nothing else. There is no uploads *controller*:
 * an upload only ever makes sense as part of something — a document on an
 * application, a photo on a product — and a generic "POST me a file" endpoint
 * would be an object with no owner and no authorisation rule. Feature modules
 * import this one and put the route where the permission check already lives.
 *
 * `STORAGE_PROVIDER` needs no import here: `ProvidersModule` is @Global.
 */
@Module({
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
