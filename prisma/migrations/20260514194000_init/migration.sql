-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT,
    "scope" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WidgetSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "brandName" TEXT NOT NULL DEFAULT 'Weilai Concept',
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WidgetSettings_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandWidgetData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "brandName" TEXT NOT NULL DEFAULT 'Weilai Concept',
    "rating" REAL NOT NULL DEFAULT 4.7,
    "reviewCount" INTEGER NOT NULL DEFAULT 238,
    "trustScore" INTEGER NOT NULL DEFAULT 94,
    "aiSummary" TEXT NOT NULL DEFAULT 'Customers often mention delivery, product quality and customer support.',
    "ratingBreakdown" TEXT NOT NULL DEFAULT '{"5":172,"4":44,"3":14,"2":5,"1":3}',
    "profileUrl" TEXT NOT NULL DEFAULT 'https://www.furniturebrandreviews.com/review/weilai-concept',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandWidgetData_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "reviewDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandReview_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productHandle" TEXT,
    "productTitle" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductReview_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductReviewSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "productReviewsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoApproveReviews" BOOLEAN NOT NULL DEFAULT false,
    "requireEmail" BOOLEAN NOT NULL DEFAULT true,
    "showVerifiedBadge" BOOLEAN NOT NULL DEFAULT true,
    "allowPhotoReviews" BOOLEAN NOT NULL DEFAULT false,
    "emailNotificationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductReviewSettings_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE
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
CREATE UNIQUE INDEX "ProductReviewSettings_shopDomain_key" ON "ProductReviewSettings"("shopDomain");
