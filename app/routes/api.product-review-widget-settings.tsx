import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  corsJson,
  getProductReviewWidgetSettings,
  requiredString
} from "~/models/reviews.server";
import { getShopEntitlements } from "~/models/entitlements.server";
import { defaultProductReviewWidgetSettings } from "~/models/product-review-widget-settings";
import {
  coalescePublicWidgetLoad,
  publicWidgetCacheKey,
  readPublicWidgetCache,
  readStalePublicWidgetCache,
  writePublicWidgetCache
} from "~/models/public-widget-cache.server";

const publicCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=300",
  "CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
  "Vercel-CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=300"
};
const STALE_REVALIDATE_WAIT_MS = 750;

type WidgetSettings =
  | Awaited<ReturnType<typeof getProductReviewWidgetSettings>>
  | typeof defaultProductReviewWidgetSettings;

function publicWidgetSettings(settings: WidgetSettings, isPro: boolean) {
  return {
    productReviewsEnabled: settings.productReviewsEnabled,
    productReviewWidgetEnabled: settings.productReviewWidgetEnabled,
    requireEmail: settings.requireEmail,
    showVerifiedBadge: settings.showVerifiedBadge,
    allowPhotoReviews: settings.allowPhotoReviews,
    starColor: settings.starColor,
    starSize: settings.starSize,
    starGap: settings.starGap,
    starRatingBadgeStarColor: settings.starRatingBadgeStarColor,
    starRatingBadgeTextColor: settings.starRatingBadgeTextColor,
    starRatingBadgeBackgroundColor: settings.starRatingBadgeBackgroundColor,
    starRatingBadgeBorderColor: settings.starRatingBadgeBorderColor,
    starRatingBadgeBorderWidth: settings.starRatingBadgeBorderWidth,
    starRatingBadgeBorderRadius: settings.starRatingBadgeBorderRadius,
    starRatingBadgeStarGap: settings.starRatingBadgeStarGap,
    starRatingBadgeHideNoReviewProduct: settings.starRatingBadgeHideNoReviewProduct,
    starRatingBadgeScrollToReviews: settings.starRatingBadgeScrollToReviews,
    ratingBarColor: settings.ratingBarColor,
    ratingBarBackgroundColor: settings.ratingBarBackgroundColor,
    ratingBadgeBackgroundColor: settings.ratingBadgeBackgroundColor,
    ratingBadgeBorderRadius: settings.ratingBadgeBorderRadius,
    ratingBadgePadding: settings.ratingBadgePadding,
    avatarBackgroundColor: settings.avatarBackgroundColor,
    avatarTextColor: settings.avatarTextColor,
    avatarSize: settings.avatarSize,
    buttonBackgroundColor: settings.buttonBackgroundColor,
    buttonTextColor: settings.buttonTextColor,
    buttonBorderColor: settings.buttonBorderColor,
    textColor: settings.textColor,
    lighterTextColor: settings.lighterTextColor,
    titleTextColor: settings.titleTextColor,
    contentTextColor: settings.contentTextColor,
    titleFontSize: settings.titleFontSize,
    contentFontSize: settings.contentFontSize,
    hideReviewDate: settings.hideReviewDate,
    hideNoReviewProduct: settings.hideNoReviewProduct,
    borderColor: settings.borderColor,
    cardBackgroundColor: settings.cardBackgroundColor,
    borderRadius: settings.borderRadius,
    reviewCardBorderWidth: settings.reviewCardBorderWidth,
    buttonBorderRadius: settings.buttonBorderRadius,
    widgetBackgroundColor: settings.widgetBackgroundColor,
    widgetBorderRadius: settings.widgetBorderRadius,
    widgetBorderWidth: settings.widgetBorderWidth,
    reviewCardSpacing: settings.reviewCardSpacing,
    widgetMaxWidth: settings.widgetMaxWidth,
    showAverageRating: true,
    showReviewCount: true,
    showRatingBreakdown: true,
    showWriteReviewButton: true,
    showAskQuestionButton: settings.showAskQuestionButton,
    showAiSummary: settings.showAiSummary,
    showReviewHighlights: settings.showReviewHighlights,
    showPhotoSummary: settings.showPhotoSummary,
    photoSummaryLimit: settings.photoSummaryLimit,
    showReviewerPhotos: settings.showReviewerPhotos,
    layoutType: isPro ? settings.layoutType : "standard",
    carouselCardsPerRow: settings.carouselCardsPerRow,
    carouselAutoSlide: settings.carouselAutoSlide,
    carouselAutoplaySpeed: settings.carouselAutoplaySpeed,
    carouselShowArrows: settings.carouselShowArrows,
    carouselShowDots: settings.carouselShowDots,
    reviewsPerPage: settings.reviewsPerPage,
    reviewsPerRow: settings.reviewsPerRow,
    sortDefault: settings.sortDefault === "lowest_rating" ? "pictures_first" : settings.sortDefault
  };
}

function isPrismaPoolTimeout(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2024");
}

function settingsResponse(data: Record<string, unknown>, cacheStatus: string) {
  return corsJson(data, {
    headers: { ...publicCacheHeaders, "X-FBR-Cache": cacheStatus }
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = requiredString(url.searchParams.get("shop"), "shop");
  const cacheKey = publicWidgetCacheKey(shop, "__widget-settings__", "", "", false);
  const cachedData = readPublicWidgetCache(cacheKey);
  if (cachedData) return settingsResponse(cachedData, "hit");

  const staleData = readStalePublicWidgetCache(cacheKey);
  const loadPromise = coalescePublicWidgetLoad(cacheKey, async () => {
    // The production pool has one connection per serverless instance. Keep
    // these reads serial so this request cannot compete with itself.
    const settings = await getProductReviewWidgetSettings(shop);
    const entitlements = await getShopEntitlements(shop);
    return publicWidgetSettings(settings, entitlements.isPro);
  }).then((data) => {
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

    if (outcome.kind === "fresh") return settingsResponse(outcome.data, "refresh");
    if (outcome.kind === "stale") return settingsResponse(staleData, "stale-while-refresh");
    if (isPrismaPoolTimeout(outcome.error)) return settingsResponse(staleData, "stale-if-error");
    throw outcome.error;
  }

  try {
    return settingsResponse(await loadPromise, "miss");
  } catch (error) {
    if (!isPrismaPoolTimeout(error)) throw error;
    return settingsResponse(publicWidgetSettings(defaultProductReviewWidgetSettings, false), "fallback");
  }
};
