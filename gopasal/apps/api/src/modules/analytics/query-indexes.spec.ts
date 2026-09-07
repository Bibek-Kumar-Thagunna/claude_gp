import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * The seller vertical's indexes, asserted against the schema itself.
 *
 * There is no database in a unit run, so this cannot measure a plan. What it *can*
 * do is stop the indexes being deleted by accident — which is the realistic failure,
 * because an index is invisible in application code and a composite looks redundant
 * next to a single-column one that it in fact replaced.
 *
 * Every assertion below has a query behind it, named in
 * `migrations/20260826161105_seller_query_indexes/migration.sql`. If one of these
 * fails, either that query changed shape (update both) or the index was dropped
 * (put it back).
 */

const PRISMA_DIR = join(__dirname, '..', '..', '..', 'prisma');
const SCHEMA = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');

/** The `@@index`/`@@unique` declarations inside one model block. */
function modelIndexes(model: string): string[] {
  const start = SCHEMA.indexOf(`\nmodel ${model} {`);
  assert.notEqual(start, -1, `model ${model} not found in schema.prisma`);
  const end = SCHEMA.indexOf('\n}', start);
  const body = SCHEMA.slice(start, end);
  return [...body.matchAll(/@@(?:index|unique)\(\[([^\]]+)\]\)/g)].map((m) =>
    (m[1] ?? '').replace(/\s+/g, ''),
  );
}

describe('seller query indexes', () => {
  it('indexes Order by shop and placed date, for every windowed read', () => {
    // analytics window read + previous-window groupBy + the paged seller queue.
    assert.ok(modelIndexes('Order').includes('shopId,placedAt'));
  });

  it('indexes Order by shop and status, for the open-orders snapshot', () => {
    // groupBy(status) over one shop's live statuses, and ?status= on the queue.
    assert.ok(modelIndexes('Order').includes('shopId,status'));
  });

  it('keeps the platform-wide Order status index', () => {
    // AdminService counts statuses with no shop to anchor on; the composite above
    // cannot serve that, because status is not its leading column.
    assert.ok(modelIndexes('Order').includes('status'));
  });

  it('does not carry a redundant single-column Order shop index', () => {
    // Covered as the leftmost prefix of both composites. Re-adding it would cost a
    // b-tree write per order insert and update for no read benefit.
    assert.ok(!modelIndexes('Order').includes('shopId'));
  });

  it('indexes OrderItem by product, for the top-products fold', () => {
    assert.ok(modelIndexes('OrderItem').includes('productId'));
  });

  it('indexes Product by shop and active flag, for the inventory counts', () => {
    assert.ok(modelIndexes('Product').includes('shopId,isActive'));
  });

  it('does not carry a redundant single-column Product shop index', () => {
    assert.ok(!modelIndexes('Product').includes('shopId'));
  });

  it('leaves the ShopMembership permission lookup on its existing unique', () => {
    // rbac loads `where: { userId, status: 'ACTIVE' }`; UNIQUE(userId, shopId) is
    // index-backed with userId leading, so no extra index is justified.
    assert.ok(modelIndexes('ShopMembership').includes('userId,shopId'));
  });

  it('ships a migration for the index changes', () => {
    // A schema edit with no migration is a schema that only exists on one laptop.
    const dirs = readdirSync(join(PRISMA_DIR, 'migrations'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const dir = dirs.find((d) => d.endsWith('_seller_query_indexes'));
    assert.ok(dir, 'no _seller_query_indexes migration directory');
    const sql = readFileSync(join(PRISMA_DIR, 'migrations', dir, 'migration.sql'), 'utf8');
    for (const stmt of [
      'CREATE INDEX "Order_shopId_placedAt_idx"',
      'CREATE INDEX "Order_shopId_status_idx"',
      'CREATE INDEX "OrderItem_productId_idx"',
      'CREATE INDEX "Product_shopId_isActive_idx"',
      'DROP INDEX "Order_shopId_idx"',
      'DROP INDEX "Product_shopId_idx"',
    ]) {
      assert.ok(sql.includes(stmt), `migration is missing: ${stmt}`);
    }
  });
});
