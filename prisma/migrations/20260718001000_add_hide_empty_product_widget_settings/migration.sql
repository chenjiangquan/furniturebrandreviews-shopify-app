ALTER TABLE "ProductReviewSettings"
ADD COLUMN "hideNoReviewProduct" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "starRatingBadgeHideNoReviewProduct" BOOLEAN NOT NULL DEFAULT false;
