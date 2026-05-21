-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT,
    "scope" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetSettings" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "brandName" TEXT NOT NULL DEFAULT 'Weilai Concept',
    "brandSlug" TEXT NOT NULL DEFAULT '',
    "brandWebsite" TEXT,
    "profileUrl" TEXT NOT NULL DEFAULT 'https://www.furniturebrandreviews.com',
    "showAiSummary" BOOLEAN NOT NULL DEFAULT true,
    "showTotalReviewCount" BOOLEAN NOT NULL DEFAULT true,
    "showRatingBreakdown" BOOLEAN NOT NULL DEFAULT true,
    "primaryColor" TEXT NOT NULL DEFAULT '#1f6f64',
    "starColor" TEXT NOT NULL DEFAULT '#f5a623',
    "borderRadius" INTEGER NOT NULL DEFAULT 8,
    "widgetLayout" TEXT NOT NULL DEFAULT 'compact',
    "carouselAutoplay" BOOLEAN NOT NULL DEFAULT true,
    "floatingBadgePosition" TEXT NOT NULL DEFAULT 'bottom-right',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WidgetSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandWidgetData" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "brandName" TEXT NOT NULL DEFAULT 'Weilai Concept',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.7,
    "reviewCount" INTEGER NOT NULL DEFAULT 238,
    "trustScore" INTEGER NOT NULL DEFAULT 94,
    "aiSummary" TEXT NOT NULL DEFAULT 'Customers often mention delivery, product quality and customer support.',
    "ratingBreakdown" TEXT NOT NULL DEFAULT '{"5":172,"4":44,"3":14,"2":5,"1":3}',
    "profileUrl" TEXT NOT NULL DEFAULT 'https://www.furniturebrandreviews.com/review/weilai-concept',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandWidgetData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandReview" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "reviewDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productHandle" TEXT,
    "productTitle" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "usefulCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'STOREFRONT',
    "merchantReply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductQuestion" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productHandle" TEXT,
    "productTitle" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductReviewSettings" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productReviewsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "productReviewWidgetEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoApproveReviews" BOOLEAN NOT NULL DEFAULT false,
    "requireEmail" BOOLEAN NOT NULL DEFAULT true,
    "showVerifiedBadge" BOOLEAN NOT NULL DEFAULT true,
    "allowPhotoReviews" BOOLEAN NOT NULL DEFAULT false,
    "emailNotificationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "starColor" TEXT NOT NULL DEFAULT '#f5a623',
    "starBackgroundColor" TEXT NOT NULL DEFAULT '#00b67a',
    "starBorderColor" TEXT NOT NULL DEFAULT '#00b67a',
    "starBorderRadius" INTEGER NOT NULL DEFAULT 2,
    "starSize" INTEGER NOT NULL DEFAULT 22,
    "starGap" INTEGER NOT NULL DEFAULT 2,
    "ratingBarColor" TEXT NOT NULL DEFAULT '#f5a623',
    "ratingBarBackgroundColor" TEXT NOT NULL DEFAULT '#eef0f2',
    "ratingBadgeBackgroundColor" TEXT NOT NULL DEFAULT '#fff7e6',
    "ratingBadgeBorderColor" TEXT NOT NULL DEFAULT '#f1c36d',
    "ratingBadgeBorderRadius" INTEGER NOT NULL DEFAULT 999,
    "ratingBadgePadding" INTEGER NOT NULL DEFAULT 8,
    "avatarBackgroundColor" TEXT NOT NULL DEFAULT '#eef4ff',
    "avatarTextColor" TEXT NOT NULL DEFAULT '#24438f',
    "avatarSize" INTEGER NOT NULL DEFAULT 28,
    "buttonBackgroundColor" TEXT NOT NULL DEFAULT '#1f6f64',
    "buttonTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "textColor" TEXT NOT NULL DEFAULT '#202223',
    "lighterTextColor" TEXT NOT NULL DEFAULT '#6d7175',
    "titleTextColor" TEXT NOT NULL DEFAULT '#202223',
    "contentTextColor" TEXT NOT NULL DEFAULT '#202223',
    "titleFontSize" INTEGER NOT NULL DEFAULT 16,
    "contentFontSize" INTEGER NOT NULL DEFAULT 15,
    "hideReviewDate" BOOLEAN NOT NULL DEFAULT false,
    "borderColor" TEXT NOT NULL DEFAULT '#dfe3e8',
    "cardBackgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "borderRadius" INTEGER NOT NULL DEFAULT 8,
    "widgetBackgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "widgetBorderRadius" INTEGER NOT NULL DEFAULT 8,
    "widgetBorderWidth" INTEGER NOT NULL DEFAULT 0,
    "reviewCardSpacing" INTEGER NOT NULL DEFAULT 16,
    "widgetMaxWidth" INTEGER NOT NULL DEFAULT 960,
    "showAverageRating" BOOLEAN NOT NULL DEFAULT true,
    "showReviewCount" BOOLEAN NOT NULL DEFAULT true,
    "showRatingBreakdown" BOOLEAN NOT NULL DEFAULT true,
    "showWriteReviewButton" BOOLEAN NOT NULL DEFAULT true,
    "showAskQuestionButton" BOOLEAN NOT NULL DEFAULT false,
    "showAiSummary" BOOLEAN NOT NULL DEFAULT true,
    "showReviewHighlights" BOOLEAN NOT NULL DEFAULT true,
    "showPhotoSummary" BOOLEAN NOT NULL DEFAULT true,
    "photoSummaryLimit" INTEGER NOT NULL DEFAULT 8,
    "showReviewerPhotos" BOOLEAN NOT NULL DEFAULT false,
    "layoutType" TEXT NOT NULL DEFAULT 'standard',
    "carouselCardsPerRow" INTEGER NOT NULL DEFAULT 3,
    "carouselAutoSlide" BOOLEAN NOT NULL DEFAULT false,
    "carouselAutoplaySpeed" INTEGER NOT NULL DEFAULT 4,
    "carouselShowArrows" BOOLEAN NOT NULL DEFAULT true,
    "carouselShowDots" BOOLEAN NOT NULL DEFAULT true,
    "reviewsPerPage" INTEGER NOT NULL DEFAULT 5,
    "reviewsPerRow" INTEGER NOT NULL DEFAULT 3,
    "sortDefault" TEXT NOT NULL DEFAULT 'newest',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductReviewSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleSeoSettings" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "seoRichSnippetsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleShoppingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reviewsSiteEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleSeoSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionSettings" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetSettings_shopDomain_key" ON "WidgetSettings"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "BrandWidgetData_shopDomain_key" ON "BrandWidgetData"("shopDomain");

-- CreateIndex
CREATE INDEX "BrandReview_shopDomain_idx" ON "BrandReview"("shopDomain");

-- CreateIndex
CREATE INDEX "ProductReview_shopDomain_productId_idx" ON "ProductReview"("shopDomain", "productId");

-- CreateIndex
CREATE INDEX "ProductReview_shopDomain_status_idx" ON "ProductReview"("shopDomain", "status");

-- CreateIndex
CREATE INDEX "ProductQuestion_shopDomain_productId_idx" ON "ProductQuestion"("shopDomain", "productId");

-- CreateIndex
CREATE INDEX "ProductQuestion_shopDomain_status_idx" ON "ProductQuestion"("shopDomain", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReviewSettings_shopDomain_key" ON "ProductReviewSettings"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleSeoSettings_shopDomain_key" ON "GoogleSeoSettings"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionSettings_shopDomain_key" ON "SubscriptionSettings"("shopDomain");

-- AddForeignKey
ALTER TABLE "WidgetSettings" ADD CONSTRAINT "WidgetSettings_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandWidgetData" ADD CONSTRAINT "BrandWidgetData_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandReview" ADD CONSTRAINT "BrandReview_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReviewSettings" ADD CONSTRAINT "ProductReviewSettings_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleSeoSettings" ADD CONSTRAINT "GoogleSeoSettings_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionSettings" ADD CONSTRAINT "SubscriptionSettings_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

