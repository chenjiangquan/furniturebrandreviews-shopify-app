ALTER TABLE "Shop" ADD COLUMN "storeName" TEXT;
ALTER TABLE "Shop" ADD COLUMN "storeEmail" TEXT;
ALTER TABLE "Shop" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Shop" ADD COLUMN "shopOwnerEmail" TEXT;
ALTER TABLE "Shop" ADD COLUMN "notificationEmail" TEXT;
ALTER TABLE "Shop" ADD COLUMN "reviewEmailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Shop" ADD COLUMN "questionEmailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
