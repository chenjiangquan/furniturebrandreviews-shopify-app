import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { del, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { sendAppOwnerReviewNotification, sendReviewNotification } from "~/models/notifications.server";
import {
  clampRating,
  corsJson,
  createProductReview,
  getProductReviewPublicBundle,
  getProductReviewPublicRatingBundle,
  getProductReviewRatingSummary,
  getProductReviewWidgetSettings,
  getProductReviewSummary,
  requiredString
} from "~/models/reviews.server";
import { isFreeProShop } from "~/shopify.server";
import {
  clearPublicWidgetCache,
  coalescePublicWidgetLoad,
  publicWidgetCacheKey,
  readPublicWidgetCache,
  readStalePublicWidgetCache,
  writePublicWidgetCache
} from "~/models/public-widget-cache.server";
import {
  protectStorefrontReviewSubmission,
  storefrontReviewCaptchaSiteKey,
  validateStorefrontReviewPayload
} from "~/models/storefront-review-protection.server";

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=300",
  "CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
  "Vercel-CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=300"
};
const STALE_REVALIDATE_WAIT_MS = 750;
const MAX_REVIEW_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_MULTIPART_REVIEW_BYTES = MAX_REVIEW_IMAGE_BYTES + 256 * 1024;
const REVIEW_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function isUploadedFile(value: unknown): value is File {
  return Boolean(
    value &&
    typeof value === "object" &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function" &&
    "size" in value &&
    typeof value.size === "number" &&
    "type" in value &&
    typeof value.type === "string"
  );
}

function hasExpectedImageSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (contentType === "image/gif") return new TextDecoder().decode(bytes.slice(0, 6)) === "GIF87a" || new TextDecoder().decode(bytes.slice(0, 6)) === "GIF89a";
  if (contentType === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return false;
}

async function uploadReviewImage(file: File, shopDomain: string) {
  const extension = REVIEW_IMAGE_EXTENSIONS[file.type];
  if (!extension) {
    throw new Response("Upload a JPEG, PNG, WebP, or GIF image.", { status: 400 });
  }
  if (file.size > MAX_REVIEW_IMAGE_BYTES) {
    throw new Response("Review photo must be 3 MB or smaller.", { status: 413 });
  }

  const body = await file.arrayBuffer();
  if (!hasExpectedImageSignature(file.type, new Uint8Array(body))) {
    throw new Response("The uploaded review photo is not a valid image.", { status: 400 });
  }

  const shopPath = shopDomain.replace(/\.myshopify\.com$/u, "");
  const blob = await put(`review-images/${shopPath}/${randomUUID()}.${extension}`, body, {
    access: "public",
    addRandomSuffix: false,
    contentType: file.type
  });
  return blob.url;
}

function isPrismaPoolTimeout(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2024");
}

async function withPoolTimeoutRetry<T>(load: () => Promise<T>, allowRetry: boolean) {
  try {
    return await load();
  } catch (error) {
    if (!allowRetry || !isPrismaPoolTimeout(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 150 + Math.floor(Math.random() * 150)));
    return load();
  }
}

function staleResponse(data: Record<string, unknown>, reason: string) {
  return corsJson(data, {
    headers: { ...publicCacheHeaders, "X-FBR-Cache": reason }
  });
}

async function loadPublicWidgetData(
  shop: string,
  productId: string,
  productHandle: string,
  productTitle: string,
  summaryOnly: boolean
) {
  if (summaryOnly) {
    const bundle = await getProductReviewPublicRatingBundle(shop, productId, productHandle, productTitle);
    const settings = bundle.settings || await getProductReviewWidgetSettings(shop);
    const entitlements = isFreeProShop(shop)
      ? { isPro: true }
      : { isPro: bundle.plan === "PRO" };
    let summary = bundle.summary;
    if (summary.reviewCount === 0 && (productHandle || productTitle)) {
      summary = await getProductReviewRatingSummary(shop, productId, productHandle, productTitle);
    }

    return {
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
        hideNoReviewProduct: settings.starRatingBadgeHideNoReviewProduct,
        scrollToReviews: settings.starRatingBadgeScrollToReviews
      }
    };
  }

  const bundle = await getProductReviewPublicBundle(shop, productId, productHandle, productTitle);
  const settings = bundle.settings || await getProductReviewWidgetSettings(shop);
  const entitlements = isFreeProShop(shop)
    ? { isPro: true }
    : { isPro: bundle.plan === "PRO" };
  let summary = bundle.summary;
  if (summary.reviewCount === 0 && (productHandle || productTitle)) {
    summary = await getProductReviewSummary(shop, productId, productHandle, productTitle);
  }

  const { id, shopDomain, createdAt, updatedAt, ...widgetSettings } = settings;
  return {
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
      hideNoReviewProduct: settings.starRatingBadgeHideNoReviewProduct,
      scrollToReviews: settings.starRatingBadgeScrollToReviews
    },
    widgetSettings: {
      ...widgetSettings,
      layoutType: entitlements.isPro ? widgetSettings.layoutType : "standard"
    },
    captchaSiteKey: storefrontReviewCaptchaSiteKey()
  };
}

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

  const staleData = readStalePublicWidgetCache(cacheKey);
  const loadPromise = coalescePublicWidgetLoad(cacheKey, () =>
    withPoolTimeoutRetry(
      () => loadPublicWidgetData(shop, productId, productHandle, productTitle, summaryOnly),
      !staleData
    )
  ).then((data) => {
    writePublicWidgetCache(cacheKey, data);
    return data;
  });

  if (staleData) {
    const outcome = await Promise.race([
      loadPromise.then(
        (data) => ({ kind: "fresh" as const, data }),
        (error: unknown) => ({ kind: "error" as const, error })
      ),
      new Promise<{ kind: "stale" }>((resolve) =>
        setTimeout(() => resolve({ kind: "stale" }), STALE_REVALIDATE_WAIT_MS)
      )
    ]);

    if (outcome.kind === "fresh") {
      return corsJson(outcome.data, { headers: publicCacheHeaders });
    }
    if (outcome.kind === "stale") {
      return staleResponse(staleData, "stale-while-refresh");
    }
    if (isPrismaPoolTimeout(outcome.error)) {
      return staleResponse(staleData, "stale-if-error");
    }
    throw outcome.error;
  }

  const data = await loadPromise;
  return corsJson(data, { headers: publicCacheHeaders });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return corsJson({});

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    const contentType = request.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");
    const maximumRequestBytes = isMultipart ? MAX_MULTIPART_REVIEW_BYTES : 32_768;
    if (contentLength > maximumRequestBytes) {
      throw new Response("Review submission is too large.", { status: 413 });
    }

    const payload = (contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData())) as Record<string, unknown>;
    const shopDomain = requiredString(String(payload.shop || payload.shopDomain || ""), "shop").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/u.test(shopDomain)) {
      throw new Response("Invalid shop domain.", { status: 400 });
    }

    const productId = requiredString(String(payload.productId || ""), "productId");
    const validated = validateStorefrontReviewPayload(payload);
    await protectStorefrontReviewSubmission(
      request,
      payload,
      shopDomain,
      productId,
      validated.customerEmail
    );

    const imageFile = isUploadedFile(payload.image) && payload.image.size > 0 ? payload.image : null;
    const suppliedImageUrl = String(payload.imageUrl || "").trim();
    if (suppliedImageUrl.length > 2048) {
      throw new Response("Review image URL is too long.", { status: 400 });
    }
    if (suppliedImageUrl && !/^https:\/\//u.test(suppliedImageUrl)) {
      throw new Response("Review image URL must use HTTPS.", { status: 400 });
    }

    const imageUrl = imageFile ? await uploadReviewImage(imageFile, shopDomain) : suppliedImageUrl;

    let review;
    try {
      review = await createProductReview({
        shopDomain,
        productId,
        productHandle: String(payload.productHandle || "").slice(0, 255),
        productTitle: String(payload.productTitle || "").slice(0, 255),
        customerName: validated.customerName,
        customerEmail: validated.customerEmail,
        rating: clampRating(String(payload.rating || "")),
        title: validated.title,
        content: validated.content,
        imageUrl,
        verifiedPurchase: false,
        source: "STOREFRONT"
      });
    } catch (error) {
      if (imageFile && imageUrl) await del(imageUrl).catch(() => undefined);
      throw error;
    }
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
  } catch (error) {
    if (error instanceof Response) {
      const headers = new Headers();
      const retryAfter = error.headers.get("Retry-After");
      if (retryAfter) headers.set("Retry-After", retryAfter);
      return corsJson(
        { ok: false, error: await error.text() || "Review could not be submitted." },
        { status: error.status || 500, headers }
      );
    }
    throw error;
  }
};
