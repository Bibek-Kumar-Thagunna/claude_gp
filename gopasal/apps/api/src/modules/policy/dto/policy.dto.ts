import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePolicyDto {
  @IsString()
  key!: string; // terms | privacy | refund | delivery | cookies

  @IsString()
  @MaxLength(20)
  version!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;
}

export class UpdatePolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;
}
