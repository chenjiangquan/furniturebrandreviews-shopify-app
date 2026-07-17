ALTER TABLE "ProductReviewSettings"
ADD COLUMN "starRatingBadgeStarColor" TEXT NOT NULL DEFAULT '#f5a623',
ADD COLUMN "starRatingBadgeTextColor" TEXT NOT NULL DEFAULT '#202223',
ADD COLUMN "starRatingBadgeBackgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN "starRatingBadgeBorderColor" TEXT NOT NULL DEFAULT '#dfe3e8',
ADD COLUMN "starRatingBadgeBorderWidth" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "starRatingBadgeBorderRadius" INTEGER NOT NULL DEFAULT 8;
