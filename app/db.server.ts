import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

function databaseUrlForPrisma() {
  const rawUrl = process.env.DATABASE_URL;

  if (!rawUrl) {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl);
    const isSupabasePooler =
      url.hostname.includes("pooler.supabase.com") ||
      (url.hostname.endsWith(".supabase.co") && url.port === "6543");

    if (isSupabasePooler) {
      url.searchParams.set("pgbouncer", "true");
      url.searchParams.set("connection_limit", url.searchParams.get("connection_limit") || "1");
      url.searchParams.set("pool_timeout", url.searchParams.get("pool_timeout") || "20");
    }

    return url.toString();
  } catch (error) {
    console.error("Invalid DATABASE_URL format", error);
    return rawUrl;
  }
}

const datasourceUrl = databaseUrlForPrisma();

const prisma =
  global.prisma ||
  new PrismaClient(
    datasourceUrl
      ? {
          datasources: {
            db: {
              url: datasourceUrl
            }
          }
        }
      : undefined
  );

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
