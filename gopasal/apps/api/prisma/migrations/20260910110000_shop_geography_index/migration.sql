-- Index the exact geography expression used by customer discovery. Without
-- this, every "near me" request evaluates every shop row as the marketplace
-- grows. The partial index excludes shops that cannot participate in geo reads.
CREATE INDEX "Shop_location_geography_idx"
ON "Shop"
USING GIST ((ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography))
WHERE lat IS NOT NULL AND lng IS NOT NULL;
