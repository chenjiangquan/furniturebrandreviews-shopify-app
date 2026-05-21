ALTER TABLE "ProductReview" ADD COLUMN "usefulCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProductReviewSettings" ADD COLUMN "titleTextColor" TEXT NOT NULL DEFAULT '#202223';
ALTER TABLE "ProductReviewSettings" ADD COLUMN "contentTextColor" TEXT NOT NULL DEFAULT '#202223';
ALTER TABLE "ProductReviewSettings" ADD COLUMN "titleFontSize" INTEGER NOT NULL DEFAULT 16;
ALTER TABLE "ProductReviewSettings" ADD COLUMN "contentFontSize" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "ProductReviewSettings" ADD COLUMN "hideReviewDate" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "GoogleSeoSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "seoRichSnippetsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleShoppingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reviewsSiteEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoogleSeoSettings_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SubscriptionSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubscriptionSettings_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GoogleSeoSettings_shopDomain_key" ON "GoogleSeoSettings"("shopDomain");
CREATE UNIQUE INDEX "SubscriptionSettings_shopDomain_key" ON "SubscriptionSettings"("shopDomain");
