CREATE TABLE "MonthlyPlanUsage" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "reviewDeletions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyPlanUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyPlanUsage_shopDomain_monthKey_key"
ON "MonthlyPlanUsage"("shopDomain", "monthKey");

CREATE INDEX "MonthlyPlanUsage_shopDomain_monthKey_idx"
ON "MonthlyPlanUsage"("shopDomain", "monthKey");

ALTER TABLE "MonthlyPlanUsage"
ADD CONSTRAINT "MonthlyPlanUsage_shopDomain_fkey"
FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain")
ON DELETE CASCADE ON UPDATE CASCADE;
