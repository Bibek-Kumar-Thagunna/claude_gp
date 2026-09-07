import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SEARCH_MAX_LENGTH } from '../../../common/dto/pagination.dto';

export class CreateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @IsString()
  productId?: string;
}

export class ReplyReviewDto {
  @IsString()
  @MaxLength(1000)
  reply!: string;
}

/** Newest-first is what a shop reads; oldest-first is for working through a backlog. */
export const REVIEW_SORTS = ['newest', 'oldest'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

/**
 * `?rating=1,2` → `[1, 2]`.
 *
 * Values are parsed to numbers here and validated by `@IsInt` + `@Min`/`@Max` on the
 * property, so `?rating=nine` is a 400 that names the field rather than an empty page.
 * A non-string is handed back untouched so `@IsArray` is what rejects it. Typed
 * `unknown` in and out because `class-transformer` types `value` as `any`, and letting
 * that leak would turn the decorator into an unchecked hole.
 */
function toRatingList(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

/** `?answered=true|false`. Strings, not a boolean — see `ListShopReviewsQueryDto.answered`. */
export const ANSWERED_VALUES = ['true', 'false'] as const;
export type AnsweredValue = (typeof ANSWERED_VALUES)[number];

/**
 * The seller review list's query string.
 *
 * `listForShopManage` used to take a shop id and nothing else, with no `take` at
 * all: one review exists per delivered order, customers write them, and the shop
 * cannot delete them — so the read grew for as long as the shop succeeded, and the
 * console's filters ran over whatever that read happened to return.
 *
 * The two filters mirror what the console actually offers. `answered` is the
 * "not answered yet" queue, and `rating` is the "1–2 stars" one expressed as the
 * numbers the customers chose rather than as a mood.
 */
export class ListShopReviewsQueryDto {
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

  @ApiPropertyOptional({
    description: 'Matches the review comment or the order code (case-insensitive)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;

  /**
   * `?answered=true` → only replied-to reviews; `?answered=false` → the unanswered queue.
   *
   * Declared as the two literal strings rather than as a `boolean` because query
   * strings are validated with `enableImplicitConversion` on — they have to be, since
   * `?page=2` arrives as `"2"` — and class-transformer converts a boolean-typed
   * property with `!!value`. `!!'false'` is `true` and `!!'maybe'` is `true`, so a
   * `boolean` here would read the unanswered filter as "answered" and accept nonsense
   * without a word. `@IsIn` on the raw strings rejects `?answered=maybe` with a message
   * that names the field; `wantsAnswered` does the one conversion, once.
   */
  @ApiPropertyOptional({
    enum: ANSWERED_VALUES,
    description: 'true = only reviews the shop has replied to, false = only unanswered',
  })
  @IsOptional()
  @IsIn(ANSWERED_VALUES)
  answered?: AnsweredValue;

  @ApiPropertyOptional({
    description: 'One rating, or several comma-separated (e.g. 1,2)',
    isArray: true,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toRatingList(value))
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(5, { each: true })
  rating?: number[];

  @ApiPropertyOptional({ enum: REVIEW_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(REVIEW_SORTS)
  sort: ReviewSort = 'newest';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  /** The `answered` filter as a tri-state: `true`, `false`, or "no filter". */
  get wantsAnswered(): boolean | undefined {
    if (this.answered === undefined) return undefined;
    return this.answered === 'true';
  }
}
