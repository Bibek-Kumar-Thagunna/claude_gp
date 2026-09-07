-- Seller-vertical query indexes.
--
-- Every index below is justified by a query that ships today; nothing here is
-- speculative. The three composites all follow the same shape — equality on the
-- tenant column, then the thing the query actually ranges or filters on — because
-- every seller read is scoped to one shop (or to the caller's permitted set) and a
-- single-column tenant index leaves Postgres re-filtering the whole matched set.
--
-- Two single-column indexes are dropped as strictly redundant: Postgres can use the
-- leftmost prefix of a composite, so "Order"("shopId") is fully covered by
-- ("shopId", "placedAt") and "Product"("shopId") by ("shopId", "isActive"). Keeping
-- them would cost a second b-tree write on every insert and update for no read
-- benefit. Foreign-key checks and cascades that start from shopId use the
-- composites for the same prefix reason.

-- ─────────────────────────────────────────────────────────────────── Order

-- Serves: AnalyticsService.build's window read
--           order.findMany({ where: { shopId: { in }, placedAt: { gte, lt } } })
--         its previous-window comparison
--           order.groupBy({ by: ['status'], where: { shopId: { in }, placedAt: { gte, lt } } })
--         the delivered-items join in the same request (via the order relation)
--         and OrdersService.listForShop's newest-first page.
-- Benefit: an index range scan over one shop's window instead of a scan of that
--          shop's entire order history; the index also supplies placedAt order, so
--          the paged queue needs no sort step.
CREATE INDEX "Order_shopId_placedAt_idx" ON "Order"("shopId", "placedAt");

-- Serves: the open-orders snapshot
--           order.groupBy({ by: ['status'],
--                           where: { shopId: { in },
--                                    status: { in: [PLACED, ACCEPTED, PACKED, OUT_FOR_DELIVERY] } } })
--         and OrdersService.listForShop's ?status= filter.
-- Benefit: "Order_status_idx" alone matches every PLACED order on the platform and
--          then discards all but one shop's. This starts from the shop.
-- Kept:    "Order_status_idx" stays — AdminService counts statuses platform-wide and
--          has no shop to anchor on.
CREATE INDEX "Order_shopId_status_idx" ON "Order"("shopId", "status");

-- Redundant: covered as the leftmost prefix of both composites above.
DROP INDEX "Order_shopId_idx";

-- ─────────────────────────────────────────────────────────────── OrderItem

-- Serves: the top-products fold, which groups a window's delivered lines by
--         productId, and ReviewsService's
--           orderItem.findFirst({ where: { orderId, productId } }).
-- Benefit: product-keyed lookups stop depending on first collecting every line of
--          every order. Only "OrderItem_orderId_idx" existed before.
-- Note:    productId is nullable (a deleted product leaves its line behind with the
--          name snapshot). Postgres b-trees index NULLs, so those rows remain
--          reachable through this index.
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- ───────────────────────────────────────────────────────────────── Product

-- Serves: three of the four AnalyticsService.inventoryHealth counts
--           product.count({ where: { shopId: { in }, isActive: true } })
--           product.count({ where: { shopId: { in }, isActive: true, trackStock: true, stock: { lte: 0 } } })
--           product.count({ where: { shopId: { in }, isActive: true, trackStock: false } })
--         and the shop-scoped variant count through the product relation, plus the
--         seller catalogue list.
-- Benefit: counts are answered from one shop's slice of the index rather than from
--          "Product_isActive_idx", which matches nearly the whole table.
CREATE INDEX "Product_shopId_isActive_idx" ON "Product"("shopId", "isActive");

-- Redundant: covered as the leftmost prefix of the composite above.
DROP INDEX "Product_shopId_idx";

-- ────────────────────────────────────────────────── Deliberately not indexed
--
-- ShopMembership: the permission lookup is
--   shopMembership.findMany({ where: { userId, status: 'ACTIVE' } })
-- and the existing UNIQUE ("userId", "shopId") is already index-backed with userId
-- leading, so it serves that read. A ("userId", "status") index would duplicate it
-- for a predicate that removes almost nothing (a user's memberships number in the
-- ones).
--
-- Order("placedAt") on its own, and Order("createdAt"): the only unscoped date
-- queries are AdminService's platform counters, which aggregate the whole table
-- anyway. Indexing for them belongs with the admin work, not here.
