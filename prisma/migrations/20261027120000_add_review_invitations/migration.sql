ALTER TABLE "ProductReview"
ADD COLUMN "reviewInvitationItemId" TEXT;

CREATE TABLE "ReviewInvitationSettings" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "delayDays" INTEGER NOT NULL DEFAULT 14,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderDays" INTEGER NOT NULL DEFAULT 7,
    "emailSubject" TEXT NOT NULL DEFAULT 'How was your recent purchase?',
    "emailHeading" TEXT NOT NULL DEFAULT 'How was your purchase?',
    "emailBody" TEXT NOT NULL DEFAULT 'We hope you are enjoying your purchase. Your feedback helps other customers make confident choices.',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewInvitationSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewInvitation" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL DEFAULT '',
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "skipReason" TEXT NOT NULL DEFAULT '',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resendEmailId" TEXT,
    "reminderResendEmailId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewInvitationItem" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL DEFAULT '',
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewInvitationItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewInvitationSuppression" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewInvitationSuppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewInvitationSettings_shopDomain_key" ON "ReviewInvitationSettings"("shopDomain");
CREATE UNIQUE INDEX "ReviewInvitation_shopDomain_shopifyOrderId_key" ON "ReviewInvitation"("shopDomain", "shopifyOrderId");
CREATE INDEX "ReviewInvitation_shopDomain_status_scheduledAt_idx" ON "ReviewInvitation"("shopDomain", "status", "scheduledAt");
CREATE INDEX "ReviewInvitation_shopDomain_createdAt_idx" ON "ReviewInvitation"("shopDomain", "createdAt");
CREATE INDEX "ReviewInvitation_resendEmailId_idx" ON "ReviewInvitation"("resendEmailId");
CREATE INDEX "ReviewInvitation_reminderResendEmailId_idx" ON "ReviewInvitation"("reminderResendEmailId");
CREATE INDEX "ReviewInvitation_customerEmail_idx" ON "ReviewInvitation"("customerEmail");
CREATE UNIQUE INDEX "ReviewInvitationItem_invitationId_productId_key" ON "ReviewInvitationItem"("invitationId", "productId");
CREATE INDEX "ReviewInvitationItem_invitationId_idx" ON "ReviewInvitationItem"("invitationId");
CREATE UNIQUE INDEX "ReviewInvitationSuppression_shopDomain_customerEmail_key" ON "ReviewInvitationSuppression"("shopDomain", "customerEmail");
CREATE INDEX "ReviewInvitationSuppression_shopDomain_idx" ON "ReviewInvitationSuppression"("shopDomain");
CREATE UNIQUE INDEX "ProductReview_reviewInvitationItemId_key" ON "ProductReview"("reviewInvitationItemId");

ALTER TABLE "ReviewInvitationSettings"
ADD CONSTRAINT "ReviewInvitationSettings_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewInvitation"
ADD CONSTRAINT "ReviewInvitation_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewInvitationItem"
ADD CONSTRAINT "ReviewInvitationItem_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "ReviewInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewInvitationSuppression"
ADD CONSTRAINT "ReviewInvitationSuppression_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductReview"
ADD CONSTRAINT "ProductReview_reviewInvitationItemId_fkey" FOREIGN KEY ("reviewInvitationItemId") REFERENCES "ReviewInvitationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
