import type { LoaderFunctionArgs } from "@remix-run/node";
import { corsJson } from "~/models/reviews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const brandSlug = String(url.searchParams.get("brandSlug") || "weilai-concept").trim();

  return corsJson({
    exists: true,
    brandName: "Weilai Concept",
    brandSlug,
    brandProfileUrl: `https://www.furniturebrandreviews.com/review/${brandSlug}`
  });
};
