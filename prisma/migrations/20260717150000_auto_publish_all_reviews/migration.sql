UPDATE "ProductReview"
SET "status" = 'PUBLISHED'
WHERE "status" <> 'PUBLISHED';

ALTER TABLE "ProductReview"
ALTER COLUMN "status" SET DEFAULT 'PUBLISHED';
