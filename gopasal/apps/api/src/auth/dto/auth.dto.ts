import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

const SURFACES = ['customer', 'seller', 'admin', 'rider'] as const;

export class RequestOtpDto {
  @ApiProperty({ example: '9812345678', description: 'Nepal mobile (with or without +977)' })
  @IsString()
  @Matches(/[0-9+\s-]{7,15}/, { message: 'Enter a valid phone number' })
  phone!: string;

  @ApiPropertyOptional({ example: 'login', default: 'login' })
  @IsOptional()
  @IsIn(['login'])
  purpose?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '9812345678' })
  @IsString()
  @Matches(/[0-9+\s-]{7,15}/, { message: 'Enter a valid phone number' })
  phone!: string;

  @ApiProperty({ example: '1234' })
  @IsString()
  @Length(4, 8)
  code!: string;

  @ApiPropertyOptional({ default: 'login' })
  @IsOptional()
  @IsIn(['login'])
  purpose?: string;

  // `IsIn` takes a `readonly any[]`, so the `as const` tuple goes in as-is —
  // which keeps the literal union visible to Swagger on the line above.
  @ApiPropertyOptional({ enum: SURFACES, default: 'customer' })
  @IsOptional()
  @IsIn(SURFACES)
  surface?: string;
}

export class RefreshDto {
  @ApiPropertyOptional({ description: 'Native refresh token; web clients use the HttpOnly cookie' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Native refresh token; web clients use the HttpOnly cookie' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
