import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  corsJson,
  getProductReviewWidgetSettings,
  requiredString
} from "~/models/reviews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = requiredString(url.searchParams.get("shop"), "shop");
  const settings = await getProductReviewWidgetSettings(shop);

  return corsJson({
    productReviewsEnabled: settings.productReviewsEnabled,
    productReviewWidgetEnabled: settings.productReviewWidgetEnabled,
    requireEmail: settings.requireEmail,
    showVerifiedBadge: settings.showVerifiedBadge,
    allowPhotoReviews: settings.allowPhotoReviews,
    starColor: settings.starColor,
    starSize: settings.starSize,
    starGap: settings.starGap,
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
    textColor: settings.textColor,
    lighterTextColor: settings.lighterTextColor,
    titleTextColor: settings.titleTextColor,
    contentTextColor: settings.contentTextColor,
    titleFontSize: settings.titleFontSize,
    contentFontSize: settings.contentFontSize,
    hideReviewDate: settings.hideReviewDate,
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
    showAverageRating: settings.showAverageRating,
    showReviewCount: settings.showReviewCount,
    showRatingBreakdown: settings.showRatingBreakdown,
    showWriteReviewButton: settings.showWriteReviewButton,
    showAskQuestionButton: settings.showAskQuestionButton,
    showAiSummary: settings.showAiSummary,
    showReviewHighlights: settings.showReviewHighlights,
    showPhotoSummary: settings.showPhotoSummary,
    photoSummaryLimit: settings.photoSummaryLimit,
    showReviewerPhotos: settings.showReviewerPhotos,
    layoutType: settings.layoutType,
    carouselCardsPerRow: settings.carouselCardsPerRow,
    carouselAutoSlide: settings.carouselAutoSlide,
    carouselAutoplaySpeed: settings.carouselAutoplaySpeed,
    carouselShowArrows: settings.carouselShowArrows,
    carouselShowDots: settings.carouselShowDots,
    reviewsPerPage: settings.reviewsPerPage,
    reviewsPerRow: settings.reviewsPerRow,
    sortDefault: settings.sortDefault === "lowest_rating" ? "pictures_first" : settings.sortDefault
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
    }
  });
};
