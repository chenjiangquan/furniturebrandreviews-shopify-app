UPDATE "ProductQuestion"
SET "status" = 'PENDING'
WHERE "status" NOT IN ('PENDING', 'PUBLISHED');
