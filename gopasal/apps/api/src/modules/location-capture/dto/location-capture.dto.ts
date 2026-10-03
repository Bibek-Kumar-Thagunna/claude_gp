import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsLatitude, IsLongitude, IsNumber, Max, Min } from 'class-validator';

export const LOCATION_CAPTURE_MODES = ['DIRECT', 'HANDOFF'] as const;
export type LocationCaptureMode = (typeof LOCATION_CAPTURE_MODES)[number];

export class CreateLocationCaptureDto {
  @ApiProperty({ enum: LOCATION_CAPTURE_MODES })
  @IsIn(LOCATION_CAPTURE_MODES)
  mode!: LocationCaptureMode;
}

export class SubmitCapturedLocationDto {
  @ApiProperty({ example: 27.7172 })
  @IsNumber()
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 85.324 })
  @IsNumber()
  @IsLongitude()
  lng!: number;

  @ApiProperty({ description: 'Browser-reported horizontal accuracy in metres', minimum: 1, maximum: 100 })
  @IsNumber()
  @Min(1)
  @Max(100)
  accuracyM!: number;

  @ApiProperty({ description: 'The browser geolocation reading timestamp' })
  @IsDateString()
  capturedAt!: string;
}
