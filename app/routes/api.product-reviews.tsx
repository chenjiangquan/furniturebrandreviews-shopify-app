import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { sendAppOwnerReviewNotification, sendReviewNotification } from "~/models/notifications.server";
import {
  clampRating,
  corsJson,
  createProductReview,
  getProductReviewPublicBundle,
  getProductReviewWidgetSettings,
  getProductReviewSummary,
  requiredString
} from "~/models/reviews.server";
import { isFreeProShop } from "~/shopify.server";
import {
  clearPublicWidgetCache,
  publicWidgetCacheKey,
  readPublicWidgetCache,
  writePublicWidgetCache
} from "~/models/public-widget-cache.server";

const publicCacheHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store"
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsJson({});

  const url = new URL(request.url);
  const shop = requiredString(url.searchParams.get("shop"), "shop");
  const productId = String(url.searchParams.get("productId") || "").trim();
  const productHandle = String(url.searchParams.get("productHandle") || "").trim();
  const productTitle = String(url.searchParams.get("productTitle") || "").trim();
  if (!productId && !productHandle && !productTitle) {
    throw new Response("productId, productHandle, or productTitle is required.", { status: 400 });
  }
  const summaryOnly = url.searchParams.get("summaryOnly") === "1";
  const cacheKey = publicWidgetCacheKey(shop, productId, productHandle, productTitle, summaryOnly);
  const cachedData = readPublicWidgetCache(cacheKey);
  if (cachedData) return corsJson(cachedData, { headers: publicCacheHeaders });

  const bundle = await getProductReviewPublicBundle(shop, productId, productHandle, productTitle);
  const settings = bundle.settings || await getProductReviewWidgetSettings(shop);
  const entitlements = isFreeProShop(shop)
    ? { isPro: true }
    : { isPro: bundle.plan === "PRO" };
  let summary = bundle.summary;
  if (summary.reviewCount === 0 && (productHandle || productTitle)) {
    summary = await getProductReviewSummary(shop, productId, productHandle, productTitle);
  }

  if (summaryOnly) {
    const data = {
      averageRating: summary.averageRating,
      reviewCount: summary.reviewCount,
      seoRichSnippetsEnabled: entitlements.isPro && bundle.seoRichSnippetsEnabled,
      starRatingBadgeSettings: {
        starColor: settings.starRatingBadgeStarColor,
        textColor: settings.starRatingBadgeTextColor,
        backgroundColor: settings.starRatingBadgeBackgroundColor,
        borderColor: settings.starRatingBadgeBorderColor,
        borderWidth: settings.starRatingBadgeBorderWidth,
        borderRadius: settings.starRatingBadgeBorderRadius,
        starGap: settings.starRatingBadgeStarGap,
        hideNoReviewProduct: settings.starRatingBadgeHideNoReviewProduct
      }
    };
    writePublicWidgetCache(cacheKey, data);
    return corsJson(data, { headers: publicCacheHeaders });
  }
  const { id, shopDomain, createdAt, updatedAt, ...widgetSettings } = settings;
  const data = {
    ...summary,
    seoRichSnippetsEnabled: entitlements.isPro && bundle.seoRichSnippetsEnabled,
    starRatingBadgeSettings: {
      starColor: settings.starRatingBadgeStarColor,
      textColor: settings.starRatingBadgeTextColor,
      backgroundColor: settings.starRatingBadgeBackgroundColor,
      borderColor: settings.starRatingBadgeBorderColor,
      borderWidth: settings.starRatingBadgeBorderWidth,
      borderRadius: settings.starRatingBadgeBorderRadius,
      starGap: settings.starRatingBadgeStarGap,
      hideNoReviewProduct: settings.starRatingBadgeHideNoReviewProduct
    },
    widgetSettings: {
      ...widgetSettings,
      layoutType: entitlements.isPro ? widgetSettings.layoutType : "standard"
    }
  };
  writePublicWidgetCache(cacheKey, data);
  return corsJson(data, { headers: publicCacheHeaders });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return corsJson({});

  const contentType = request.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries(await request.formData());
  const shopDomain = requiredString(payload.shop || payload.shopDomain, "shop");
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
    source: "STOREFRONT"
  });
  clearPublicWidgetCache(shopDomain);
  await Promise.all([
    sendReviewNotification(shopDomain, review),
    sendAppOwnerReviewNotification(shopDomain, review)
  ]);

  return corsJson({
    ok: true,
    review,
    status: review.status,
    message: "Review submitted and published."
  });
};
