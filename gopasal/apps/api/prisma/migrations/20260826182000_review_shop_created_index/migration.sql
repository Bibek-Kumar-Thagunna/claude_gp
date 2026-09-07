-- Seller review list: index for the paged, shop-scoped read.
--
-- Same shape as the composites in 20260826161105_seller_query_indexes — equality on
-- the tenant column, then the column the query orders on — and for the same reason:
-- "Review"("shopId") alone matched one shop's whole review history and left Postgres
-- to sort it on every page request.
--
-- ────────────────────────────────────────────────────────────────────── Review

-- Serves: ReviewsService.listForShopManage's page
--           review.findMany({ where: { shopId, ... }, orderBy: { createdAt },
--                             skip, take })
--         its matching count
--           review.count({ where: { shopId, ... } })
--         the shop-wide summary
--           review.groupBy({ by: ['rating'], where: { shopId } })
--           review.count({ where: { shopId, sellerReply: { not: null } } })
--           review.aggregate({ where: { shopId }, _avg: { rating } })
--         and the customer-facing shop page read
--           review.findMany({ where: { shopId }, orderBy: { createdAt }, take: 100 }).
-- Benefit: the newest page is an index range scan from one end of one shop's slice,
--          with no sort step, instead of reading and sorting every review the shop
--          has ever received. Reviews only ever accumulate — one per delivered order,
--          written by customers, and a shop cannot delete them — so this is the one
--          seller table whose read cost grows with the shop's success.
CREATE INDEX "Review_shopId_createdAt_idx" ON "Review"("shopId", "createdAt");

-- Redundant: covered as the leftmost prefix of the composite above. The shop cascade
-- (Review.shopId references Shop with onDelete: Cascade) uses the same prefix.
DROP INDEX "Review_shopId_idx";

-- ────────────────────────────────────────────────── Deliberately not indexed
--
-- Review("shopId", "rating") and Review("shopId", "sellerReply"): the ?rating= and
-- ?answered= filters are selective in the wrong direction — most of a shop's reviews
-- match at least one of them — and Postgres would still have to sort the result,
-- which the createdAt composite already supplies for free. The filters run as a
-- recheck over one shop's slice, which is bounded by the shop's own order count.
--
-- Review("comment"): ?q= is a case-insensitive `contains`, which no b-tree can serve.
-- A trigram or full-text index would be the tool for that, and it is not warranted by
-- a search box over one tenant's rows; if it ever is, it belongs in its own migration
-- with its own extension.
