UPDATE "ProductQuestion"
SET "answerNotifiedAt" = "answeredAt"
WHERE "answeredAt" IS NOT NULL
  AND "answerNotifiedAt" IS NULL
  AND COALESCE("answer", '') <> '';
