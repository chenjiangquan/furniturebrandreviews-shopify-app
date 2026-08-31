CREATE TABLE "StorefrontSubmissionRateLimit" (
    "key" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontSubmissionRateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "StorefrontSubmissionRateLimit_shopDomain_idx"
ON "StorefrontSubmissionRateLimit"("shopDomain");

CREATE INDEX "StorefrontSubmissionRateLimit_expiresAt_idx"
ON "StorefrontSubmissionRateLimit"("expiresAt");

ALTER TABLE "StorefrontSubmissionRateLimit"
ADD CONSTRAINT "StorefrontSubmissionRateLimit_shopDomain_fkey"
FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain")
ON DELETE CASCADE ON UPDATE CASCADE;
