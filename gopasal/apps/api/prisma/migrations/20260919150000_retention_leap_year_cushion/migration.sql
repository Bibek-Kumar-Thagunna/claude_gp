-- Five calendar years can include leap days. The former 1,825-day baseline
-- was potentially shorter than the stated statutory minimum.
UPDATE "RetentionPolicy"
SET "days" = 1830,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'deleted_account_order_pii' AND "days" = 1825;

UPDATE "DataErasureRequest"
SET "purgeEligibleAt" = "requestedAt" + INTERVAL '1830 days',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'ANONYMIZED'
  AND "purgeEligibleAt" = "requestedAt" + INTERVAL '1825 days';
