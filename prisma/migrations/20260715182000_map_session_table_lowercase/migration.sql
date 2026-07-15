DO $$
BEGIN
  IF to_regclass('"Session"') IS NOT NULL AND to_regclass('session') IS NULL THEN
    ALTER TABLE "Session" RENAME TO "session";
  END IF;
END $$;
