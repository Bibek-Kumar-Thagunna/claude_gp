import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** The longest search term any list endpoint accepts. Mirrored by the consoles. */
export const SEARCH_MAX_LENGTH = 120;

/** Standard cursor-less pagination for list endpoints. */
export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  /**
   * Free-text search.
   *
   * Bounded, like `limit` is. Every consumer of this field spends it on Prisma
   * `contains` filters — often several per row, across several columns — so an
   * unbounded string is an unbounded amount of work asked for in a query string.
   * 120 characters is longer than any product name, coupon code, phone number or
   * order code in the system, so the ceiling costs a real search nothing. The number
   * is exported because the browsers put the same limit on their search boxes, and a
   * client cap that does not match the server's is a lie in one direction or the
   * other.
   */
  @ApiPropertyOptional({ description: 'Free-text search', maxLength: SEARCH_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

/**
 * The list envelope every paged endpoint returns.
 *
 * `totalPages` is the canonical name. `pages` carries the same number and is kept
 * because it is what shipped first and both consoles read it; renaming it would be a
 * breaking change to endpoints this work is not otherwise touching. New callers
 * should read `totalPages`.
 */
export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number; pages: number };
}

export function paginate<T>(data: T[], total: number, page: number, limit: number): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { data, meta: { page, limit, total, totalPages, pages: totalPages } };
}
