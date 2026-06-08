ALTER TABLE "WidgetSettings" ALTER COLUMN "brandName" SET DEFAULT '';
ALTER TABLE "WidgetSettings" ALTER COLUMN "profileUrl" SET DEFAULT '';

ALTER TABLE "BrandWidgetData" ALTER COLUMN "brandName" SET DEFAULT '';
ALTER TABLE "BrandWidgetData" ALTER COLUMN "profileUrl" SET DEFAULT '';

UPDATE "WidgetSettings"
SET "brandName" = ''
WHERE "brandName" = 'Weilai Concept';

UPDATE "WidgetSettings"
SET "profileUrl" = ''
WHERE "profileUrl" IN (
  'https://www.furniturebrandreviews.com',
  'https://www.furniturebrandreviews.com/review/weilai-concept'
);

UPDATE "BrandWidgetData"
SET "brandName" = ''
WHERE "brandName" = 'Weilai Concept';

UPDATE "BrandWidgetData"
SET "profileUrl" = ''
WHERE "profileUrl" = 'https://www.furniturebrandreviews.com/review/weilai-concept';
