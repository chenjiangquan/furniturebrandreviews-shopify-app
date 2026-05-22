import type { LoaderFunctionArgs } from "@remix-run/node";
import { corsJson, requiredString } from "~/models/reviews.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = requiredString(url.searchParams.get("shop"), "shop");
  const settings = await prisma.widgetSettings.findUnique({
    where: { shopDomain: shop },
    select: {
      brandName: true,
      brandSlug: true,
      profileUrl: true
    }
  });

  return corsJson({
    brandName: settings?.brandName || "",
    brandSlug: settings?.brandSlug || brandSlugFromProfileUrl(settings?.profileUrl || ""),
    brandProfileUrl: settings?.profileUrl || ""
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
    }
  });
};

function brandSlugFromProfileUrl(profileUrl: string) {
  if (!profileUrl) return "";

  try {
    const parsed = new URL(profileUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const reviewIndex = parts.indexOf("review");
    return reviewIndex >= 0 ? parts[reviewIndex + 1] || "" : parts.at(-1) || "";
  } catch {
    return "";
  }
}
