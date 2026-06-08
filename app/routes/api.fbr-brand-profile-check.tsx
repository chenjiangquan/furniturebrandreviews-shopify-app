import type { LoaderFunctionArgs } from "@remix-run/node";
import { corsJson } from "~/models/reviews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const brandSlug = String(url.searchParams.get("brandSlug") || "").trim();

  return corsJson({
    exists: Boolean(brandSlug),
    brandName: "",
    brandSlug,
    brandProfileUrl: brandSlug ? `https://www.furniturebrandreviews.com/review/${brandSlug}` : ""
  });
};
