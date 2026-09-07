import type { Prisma } from '@prisma/client';

/**
 * The two shapes Prisma will accept when writing into a `Json` column, aliased
 * here so domain code can say "this field is JSON metadata" without pulling the
 * whole `Prisma` namespace into every DTO — and, more importantly, without
 * reaching for `any` at the boundary between a plain TS object and a Json column.
 *
 * Use `JsonObject` for a keyed payload (notification metadata, audit diffs) and
 * `JsonValue` when an array or scalar is also legal.
 *
 * Note on assignability: an *interface* is not assignable to these, because
 * TypeScript only infers an implicit index signature for object literal types.
 * Declare JSON-bound payload types with `type`, or map them to fresh literals at
 * the write site.
 */
export type JsonObject = Prisma.InputJsonObject;
export type JsonValue = Prisma.InputJsonValue;
