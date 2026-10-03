import { BadRequestException } from '@nestjs/common';

/** Existing cart/checkout maximum, applied to each unique product/variant line. */
export const GROUP_LINE_QUANTITY_LIMIT = 99;
/** Request-size guard; this is a technical transport limit, not a business promise. */
export const GROUP_DRAFT_ITEM_LIMIT = 100;

export interface DraftItem {
  productId: string;
  variantId?: string | null;
  qty: number;
}

function itemKey(item: Pick<DraftItem, 'productId' | 'variantId'>) {
  return `${item.productId}:${item.variantId ?? ''}`;
}

function assertLine(item: DraftItem) {
  if (
    !item ||
    typeof item.productId !== 'string' ||
    !item.productId ||
    !Number.isInteger(item.qty) ||
    item.qty < 1 ||
    item.qty > GROUP_LINE_QUANTITY_LIMIT
  ) {
    throw new BadRequestException('Invalid group draft item');
  }
}

/** Mirrors HTTP validation for trusted/internal callers and rejects ambiguous duplicate lines. */
export function assertGroupDraftItems(items: DraftItem[]) {
  if (!Array.isArray(items) || items.length > GROUP_DRAFT_ITEM_LIMIT) {
    throw new BadRequestException(`A draft cannot contain more than ${GROUP_DRAFT_ITEM_LIMIT} items`);
  }
  const keys = new Set<string>();
  for (const item of items) {
    assertLine(item);
    const key = itemKey(item);
    if (keys.has(key)) throw new BadRequestException('Duplicate group draft items are not allowed');
    keys.add(key);
  }
}

/** Aggregate participant drafts while preserving the checkout line quantity invariant. */
export function aggregateGroupDraftItems(participants: { items: unknown }[]): DraftItem[] {
  const combined = new Map<string, DraftItem>();
  for (const participant of participants) {
    const items = Array.isArray(participant.items) ? (participant.items as DraftItem[]) : [];
    for (const item of items) {
      assertLine(item);
      const key = itemKey(item);
      const previous = combined.get(key);
      if (previous) {
        previous.qty += item.qty;
        if (previous.qty > GROUP_LINE_QUANTITY_LIMIT) {
          throw new BadRequestException(`A combined item cannot exceed ${GROUP_LINE_QUANTITY_LIMIT}`);
        }
      } else {
        combined.set(key, {
          productId: item.productId,
          variantId: item.variantId ?? null,
          qty: item.qty,
        });
      }
    }
  }
  return [...combined.values()];
}
