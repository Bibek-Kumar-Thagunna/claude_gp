import { Module } from '@nestjs/common';
import { LocationCaptureController } from './location-capture.controller';
import { LocationCaptureService } from './location-capture.service';

@Module({
  controllers: [LocationCaptureController],
  providers: [LocationCaptureService],
})
export class LocationCaptureModule {}
