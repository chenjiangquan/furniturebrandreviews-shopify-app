ALTER TABLE "ProductReviewSettings"
ADD COLUMN "buttonBorderColor" TEXT NOT NULL DEFAULT '#dfe3e8';

UPDATE "ProductReviewSettings"
SET "buttonBorderColor" = "borderColor";
