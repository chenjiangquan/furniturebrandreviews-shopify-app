import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";
import { sendReviewNotification } from "~/models/notifications.server";
import {
  clampRating,
  corsJson,
  createProductReview,
  getProductReviewRatingSummary,
  getProductReviewWidgetSettings,
  getProductReviewSummary,
  requiredString
} from "~/models/reviews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = requiredString(url.searchParams.get("shop"), "shop");
  const productId = String(url.searchParams.get("productId") || "").trim();
  const productHandle = String(url.searchParams.get("productHandle") || "").trim();
  const productTitle = String(url.searchParams.get("productTitle") || "").trim();
  if (!productId && !productHandle && !productTitle) {
    throw new Response("productId, productHandle, or productTitle is required.", { status: 400 });
  }
  if (url.searchParams.get("summaryOnly") === "1") {
    const summary = await getProductReviewRatingSummary(shop, productId, productHandle, productTitle);
    return corsJson(summary, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
      }
    });
  }
  const [summary, settings] = await Promise.all([
    getProductReviewSummary(shop, productId, productHandle, productTitle),
    getProductReviewWidgetSettings(shop)
  ]);
  const { id, shopDomain, createdAt, updatedAt, ...widgetSettings } = settings;
  return corsJson({ ...summary, widgetSettings }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
    }
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return corsJson({});

  const contentType = request.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries(await request.formData());
  const shopDomain = requiredString(payload.shop || payload.shopDomain, "shop");
  const settings = await prisma.productReviewSettings.findUnique({ where: { shopDomain } });

  const review = await createProductReview({
    shopDomain,
    productId: requiredString(payload.productId, "productId"),
    productHandle: String(payload.productHandle || ""),
    productTitle: String(payload.productTitle || ""),
    customerName: requiredString(payload.customerName || payload.name, "name"),
    customerEmail: String(payload.customerEmail || payload.email || ""),
    rating: clampRating(payload.rating),
    title: requiredString(payload.title, "title"),
    content: requiredString(payload.content, "content"),
    imageUrl: String(payload.imageUrl || ""),
    verifiedPurchase: false,
    status: settings?.autoApproveReviews ? "PUBLISHED" : "PENDING",
    source: "STOREFRONT"
  });
  void sendReviewNotification(shopDomain, review);

  return corsJson({
    ok: true,
    review,
    status: review.status,
    message: "Review submitted and waiting for merchant approval."
  });
};
