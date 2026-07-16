CREATE INDEX IF NOT EXISTS "ProductReview_shopDomain_createdAt_idx" ON "ProductReview" ("shopDomain", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductReview_shopDomain_status_createdAt_idx" ON "ProductReview" ("shopDomain", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductReview_shopDomain_productHandle_status_idx" ON "ProductReview" ("shopDomain", "productHandle", "status");
CREATE INDEX IF NOT EXISTS "ProductReview_shopDomain_productTitle_status_idx" ON "ProductReview" ("shopDomain", "productTitle", "status");

CREATE INDEX IF NOT EXISTS "ProductQuestion_shopDomain_createdAt_idx" ON "ProductQuestion" ("shopDomain", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductQuestion_shopDomain_status_createdAt_idx" ON "ProductQuestion" ("shopDomain", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductQuestion_shopDomain_productHandle_status_idx" ON "ProductQuestion" ("shopDomain", "productHandle", "status");
CREATE INDEX IF NOT EXISTS "ProductQuestion_shopDomain_productTitle_status_idx" ON "ProductQuestion" ("shopDomain", "productTitle", "status");
