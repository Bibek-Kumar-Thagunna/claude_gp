import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ALL_PERMISSIONS } from '../permissions.catalog';

/**
 * A role holds distinct keys from the catalogue, and `RolePermission` is
 * `@@id([roleId, permissionKey])`, so no role can hold more rows than there are
 * permissions in existence. Without the bound a body could ask for a hundred
 * thousand repeats of a valid key and have `createMany` discover the duplicate
 * mid-transaction; the same bound `ReorderProductImagesDto` puts on its list.
 */
const PERMISSION_LIST_MAX = ALL_PERMISSIONS.length;

/** Create a custom role (permissions validated against the scope in the service). */
export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(PERMISSION_LIST_MAX)
  @IsString({ each: true })
  permissions!: string[];
}

/** Patch a custom role. All fields optional; omit permissions to keep them. */
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  /**
   * **`@ArrayNotEmpty()` is not decoration — it closes a way to revoke everyone.**
   *
   * `CreateRoleDto` has always required a non-empty list, so a role cannot be
   * *created* with no permissions. This body did not, and `RolesService.update`
   * tests `if (patch.permissions)`, which is true for `[]`: the transaction then
   * ran `rolePermission.deleteMany({ where: { roleId } })` followed by a
   * `createMany` of zero rows, and answered 200. The role kept its name and its
   * members, and every one of them silently dropped to default-deny — the
   * quietest possible way to take a shop's staff offline, and it needed one
   * character of JSON.
   *
   * Omitting the key still means "leave the permissions alone", which is what
   * every caller does. No console can send `[]`: the seller role editor requires
   * `keys.size > 0` before it will enable Save.
   */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(PERMISSION_LIST_MAX)
  @IsString({ each: true })
  permissions?: string[];
}

/** Clone a role (usually a system template) into an editable one. */
export class CloneRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;
}

/** Change an existing platform staff member's role, addressed by phone. */
export class AssignPlatformStaffDto {
  @IsString()
  phone!: string;

  @IsString()
  roleId!: string;
}

/** Move a membership to a different role. */
export class ChangeMembershipRoleDto {
  @IsString()
  roleId!: string;
}

/** Suspend or reactivate a shop teammate. */
export class SetMembershipStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';
}
