-- Seller coupon list: index for the paged, shop-scoped read.
--
-- The third migration of the same shape as 20260826161105_seller_query_indexes:
-- equality on the tenant column, then the column the query orders on. Note that this
-- is a swap, not an addition — the composite covers everything the single-column shop
-- index covered, so the table ends up with the same number of indexes it had.
--
-- ────────────────────────────────────────────────────────────────────── Coupon

-- Serves: CouponsService.listForShopManage's page
--           coupon.findMany({ where: { shopId, ... }, orderBy: { createdAt },
--                             skip, take })
--         its matching count
--           coupon.count({ where: { shopId, ... } })
--         and the shop-wide summary
--           coupon.count({ where: { shopId } })
--           coupon.count({ where: { shopId, ...running } })
--           coupon.aggregate({ where: { shopId }, _sum: { usedCount } }).
-- Benefit: the newest page is an index range scan over one shop's slice with no sort
--          step. "Coupon"("shopId") alone matched the slice and left Postgres to sort
--          it on every request. The slice only grows: `deactivate` writes
--          `isActive: false` and no route deletes a coupon, so a shop that runs a code
--          per festival accumulates them for as long as it trades.
CREATE INDEX "Coupon_shopId_createdAt_idx" ON "Coupon"("shopId", "createdAt");

-- Redundant: covered as the leftmost prefix of the composite above. The shop cascade
-- (Coupon.shopId references Shop with onDelete: Cascade) uses the same prefix.
DROP INDEX "Coupon_shopId_idx";

-- ────────────────────────────────────────────────── Deliberately not indexed
--
-- Coupon("code"): already unique-indexed by @unique, which is what CouponsService.quote
-- and the create-time collision check use. Nothing to add.
--
-- Coupon("shopId", "isActive") and any attempt at an index for ?status=: "running" is
-- not a stored column. It is the checkout's ladder — isActive, validFrom <= now,
-- validTo, and usedCount against usageLimit — three of whose four terms compare against
-- `now` or against another column, so no b-tree can pre-compute the answer. Postgres
-- rechecks those terms over one shop's slice, which the composite above has already
-- narrowed to a range scan.
--
-- Coupon("code") for ?q=: the search is a case-insensitive `contains`, which a b-tree
-- cannot serve. A trigram index would be the tool, and it is not warranted for a search
-- box over one tenant's codes; if it ever is, it belongs in its own migration with its
-- own extension.
