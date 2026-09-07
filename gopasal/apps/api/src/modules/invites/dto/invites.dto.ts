import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

/** Invite a teammate to a shop, or a colleague to the platform console. */
export class CreateInviteDto {
  @IsString()
  phone!: string;

  @IsString()
  roleId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  /** shown in the SMS and on the join screen, e.g. "you'll handle evening orders" */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/**
 * Accept an invite. Either arm works:
 *   - `token`         → the person opened the link
 *   - `phone` + `code` → the person was read the code over the phone
 * Both still require an authenticated session on the invited number.
 */
export class AcceptInviteDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  token?: string;

  @IsOptional()
  @IsString()
  @Length(4, 8)
  code?: string;
}

export class InviteListQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED', 'ALL'])
  status?: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED' | 'ALL';
}
