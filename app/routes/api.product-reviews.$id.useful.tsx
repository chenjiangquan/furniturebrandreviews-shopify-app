import type { ActionFunctionArgs } from "@remix-run/node";
import { corsJson, incrementProductReviewUsefulCount, requiredString } from "~/models/reviews.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return corsJson({});

  const contentType = request.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries(await request.formData());
  const shopDomain = requiredString(payload.shop || payload.shopDomain, "shop");
  const reviewId = requiredString(params.id || payload.reviewId || payload.id, "reviewId");
  const updated = await incrementProductReviewUsefulCount(shopDomain, reviewId);

  return corsJson({ ok: true, usefulCount: updated.usefulCount });
};
