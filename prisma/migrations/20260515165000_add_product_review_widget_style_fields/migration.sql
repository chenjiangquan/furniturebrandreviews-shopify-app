ALTER TABLE "ProductReviewSettings" ADD COLUMN "ratingBarColor" TEXT NOT NULL DEFAULT '#f5a623';
ALTER TABLE "ProductReviewSettings" ADD COLUMN "ratingBarBackgroundColor" TEXT NOT NULL DEFAULT '#eef0f2';
ALTER TABLE "ProductReviewSettings" ADD COLUMN "ratingBadgeBackgroundColor" TEXT NOT NULL DEFAULT '#fff7e6';
ALTER TABLE "ProductReviewSettings" ADD COLUMN "ratingBadgeBorderColor" TEXT NOT NULL DEFAULT '#f1c36d';
ALTER TABLE "ProductReviewSettings" ADD COLUMN "ratingBadgeBorderRadius" INTEGER NOT NULL DEFAULT 999;
ALTER TABLE "ProductReviewSettings" ADD COLUMN "ratingBadgePadding" INTEGER NOT NULL DEFAULT 8;
