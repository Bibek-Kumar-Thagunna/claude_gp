import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** The platforms GoPasal ships to. `web` is here because the same app runs there. */
export const DEVICE_PLATFORMS = ['ios', 'android', 'web'] as const;

export class RegisterDeviceDto {
  /**
   * An Expo push token, or a raw FCM/APNs token if the app is ever built
   * without Expo's service. Bounded and character-restricted because it is
   * stored, indexed and later sent to a third party.
   */
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9_:.\-[\]]+$/, { message: 'token has characters a push token never has' })
  token!: string;

  @ApiProperty({ enum: DEVICE_PLATFORMS })
  @IsIn(DEVICE_PLATFORMS)
  platform!: (typeof DEVICE_PLATFORMS)[number];

  @ApiPropertyOptional({ example: '0.1.0' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;
}
