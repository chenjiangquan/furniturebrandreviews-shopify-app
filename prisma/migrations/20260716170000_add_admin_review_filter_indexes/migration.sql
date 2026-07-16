CREATE INDEX IF NOT EXISTS "ProductReview_shopDomain_rating_createdAt_idx" ON "ProductReview" ("shopDomain", "rating", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductReview_shopDomain_imageHidden_createdAt_idx" ON "ProductReview" ("shopDomain", "imageHidden", "createdAt");
