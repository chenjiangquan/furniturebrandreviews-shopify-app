ALTER TABLE "session"
  ADD COLUMN "refreshToken" TEXT,
  ADD COLUMN "refreshTokenExpires" TIMESTAMP(3);
