import { Prisma, type ProductQuestion, type ProductReview } from "@prisma/client";
import prisma from "~/db.server";
import { defaultProductReviewWidgetSettings } from "~/models/product-review-widget-settings";

const productReviewCreateLocks = new Map<string, Promise<ProductReview>>();
const productQuestionCreateLocks = new Map<string, Promise<ProductQuestion>>();
export const pendingReviewStatuses = ["PENDING", "Pending", "pending"];
export const publishedReviewStatuses = ["PUBLISHED", "Published", "published", "APPROVED", "Approved", "approved"];

export function corsJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function ensureShop(shopDomain: string) {
  return prisma.shop.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain }
  });
}

export async function getProductReviewWidgetSettings(shopDomain: string) {
  await ensureShop(shopDomain);
  const supportedProductReviewSettingsData = Object.fromEntries(
    Object.entries(defaultProductReviewWidgetSettings).filter(([field]) => productReviewSettingsFieldNames.has(field))
  );
  return prisma.productReviewSettings.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain, ...supportedProductReviewSettingsData }
  });
}

const productReviewSettingsFieldNames = new Set(
  Prisma.dmmf.datamodel.models
    .find((model) => model.name === "ProductReviewSettings")
    ?.fields
    .filter((field) => field.kind === "scalar" && !["id", "shopDomain", "createdAt", "updatedAt"].includes(field.name))
    .map((field) => field.name) || []
);

export async function normalizeLegacyReviewStatuses(shopDomain: string) {
  await prisma.productReview.updateMany({
    where: { shopDomain, status: { in: ["APPROVED", "Approved", "approved", "Published", "published"] } },
    data: { status: "PUBLISHED" }
  });
  await prisma.productReview.updateMany({
    where: { shopDomain, status: { in: ["Pending", "pending"] } },
    data: { status: "PENDING" }
  });
}

export async function incrementProductReviewUsefulCount(shopDomain: string, reviewId: string) {
  const review = await prisma.productReview.findFirst({
    where: { id: reviewId, shopDomain }
  });

  if (!review) {
    throw new Response("Review not found.", { status: 404 });
  }

  return prisma.productReview.update({
    where: { id: review.id },
    data: { usefulCount: { increment: 1 } }
  });
}

export function normalizeProductTitle(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function clampRating(value: FormDataEntryValue | string | null) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Response("Rating must be an integer from 1 to 5.", { status: 400 });
  }
  return rating;
}

export function requiredString(value: FormDataEntryValue | string | null, field: string) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Response(`${field} is required.`, { status: 400 });
  }
  return text;
}

export async function getProductReviewSummary(
  shopDomain: string,
  productId: string,
  productHandle = "",
  productTitle = ""
) {
  const normalizedCurrentTitle = normalizeProductTitle(productTitle);
  const reviewMatchFilters: Prisma.ProductReviewWhereInput[] = [];
  const questionMatchFilters: Prisma.ProductQuestionWhereInput[] = [];

  if (productId) {
    reviewMatchFilters.push({ productId });
    questionMatchFilters.push({ productId });
  }
  if (productHandle) {
    reviewMatchFilters.push({ productHandle });
    questionMatchFilters.push({ productHandle });
  }
  if (productTitle) {
    reviewMatchFilters.push({ productTitle });
    questionMatchFilters.push({ productTitle });
  }

  const [directPublishedReviews, titleFallbackReviews, questions] = await Promise.all([
    prisma.productReview.findMany({
      where: {
        shopDomain,
        status: { in: publishedReviewStatuses },
        ...(reviewMatchFilters.length ? { OR: reviewMatchFilters } : { id: "__no_product_match__" })
      },
      orderBy: { createdAt: "desc" }
    }),
    normalizedCurrentTitle
      ? prisma.productReview.findMany({
          where: {
            shopDomain,
            status: { in: publishedReviewStatuses },
            productTitle: { not: "" }
          },
          orderBy: { createdAt: "desc" },
          take: 2500
        })
      : Promise.resolve([]),
    prisma.productQuestion.findMany({
      where: {
        shopDomain,
        status: "PUBLISHED",
        ...(questionMatchFilters.length ? { OR: questionMatchFilters } : { id: "__no_product_match__" })
      },
      orderBy: { createdAt: "desc" },
      take: 25
    })
  ]);
  const reviewMap = new Map<string, ProductReview>();
  for (const review of directPublishedReviews) {
    reviewMap.set(review.id, review);
  }
  for (const review of titleFallbackReviews) {
    const normalizedReviewTitle = normalizeProductTitle(review.productTitle);
    if (
      normalizedCurrentTitle &&
      normalizedReviewTitle &&
      (normalizedReviewTitle === normalizedCurrentTitle ||
        normalizedReviewTitle.includes(normalizedCurrentTitle) ||
        normalizedCurrentTitle.includes(normalizedReviewTitle))
    ) {
      reviewMap.set(review.id, review);
    }
  }

  const reviews = [...reviewMap.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const ratingTotal = reviews.reduce((total, review) => total + review.rating, 0);

  return {
    averageRating: Number((reviews.length ? ratingTotal / reviews.length : 0).toFixed(1)),
    reviewCount: reviews.length,
    reviews,
    questions
  };
}

export async function createProductReview(input: {
  shopDomain: string;
  productId: string;
  productHandle?: string | null;
  productTitle?: string | null;
  customerName: string;
  customerEmail?: string | null;
  rating: number;
  title: string;
  content: string;
  imageUrl?: string | null;
  verifiedPurchase?: boolean;
  status?: "PENDING" | "PUBLISHED" | "REJECTED" | "SPAM" | "ARCHIVED";
  source?: "STOREFRONT" | "IMPORTED";
}) {
  await ensureShop(input.shopDomain);

  const data = {
    shopDomain: input.shopDomain.trim(),
    productId: input.productId.trim(),
    productHandle: input.productHandle?.trim() || "",
    productTitle: input.productTitle?.trim() || "",
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail?.trim().toLowerCase() || "",
    rating: input.rating,
    title: input.title.trim(),
    content: input.content.trim(),
    imageUrl: input.imageUrl?.trim() || "",
    source: input.source || "STOREFRONT",
    verifiedPurchase: input.verifiedPurchase || false,
    status: input.status || "PENDING"
  };
  const lockKey = [
    data.shopDomain,
    data.productId,
    data.customerEmail,
    data.title,
    data.content
  ].join("\u001f");

  const createOrReuse = async () => {
    const duplicateSince = new Date(Date.now() - 60_000);
    const existing = await prisma.productReview.findFirst({
      where: {
        shopDomain: data.shopDomain,
        productId: data.productId,
        customerEmail: data.customerEmail,
        title: data.title,
        content: data.content,
        createdAt: { gte: duplicateSince }
      },
      orderBy: { createdAt: "desc" }
    });

    if (existing) return existing;

    return prisma.productReview.create({ data });
  };

  const existingLock = productReviewCreateLocks.get(lockKey);
  if (existingLock) return existingLock;

  const lock = createOrReuse().finally(() => {
    productReviewCreateLocks.delete(lockKey);
  });
  productReviewCreateLocks.set(lockKey, lock);
  return lock;
}

export async function createProductQuestion(input: {
  shopDomain: string;
  productId: string;
  productHandle?: string | null;
  productTitle?: string | null;
  customerName: string;
  customerEmail?: string | null;
  question: string;
  answer?: string | null;
  status?: "PENDING" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
}) {
  await ensureShop(input.shopDomain);

  const data = {
    shopDomain: input.shopDomain.trim(),
    productId: input.productId.trim(),
    productHandle: input.productHandle?.trim() || "",
    productTitle: input.productTitle?.trim() || "",
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail?.trim().toLowerCase() || "",
    question: input.question.trim(),
    answer: input.answer?.trim() || "",
    status: input.status || "PENDING"
  };
  const lockKey = [
    data.shopDomain,
    data.productId,
    data.customerEmail,
    data.question
  ].join("\u001f");

  const createOrReuse = async () => {
    const duplicateSince = new Date(Date.now() - 60_000);
    const existing = await prisma.productQuestion.findFirst({
      where: {
        shopDomain: data.shopDomain,
        productId: data.productId,
        customerEmail: data.customerEmail,
        question: data.question,
        createdAt: { gte: duplicateSince }
      },
      orderBy: { createdAt: "desc" }
    });

    if (existing) return existing;

    return prisma.productQuestion.create({
      data: {
        ...data,
        answeredAt: data.answer ? new Date() : null
      }
    });
  };

  const existingLock = productQuestionCreateLocks.get(lockKey);
  if (existingLock) return existingLock;

  const lock = createOrReuse().finally(() => {
    productQuestionCreateLocks.delete(lockKey);
  });
  productQuestionCreateLocks.set(lockKey, lock);
  return lock;
}

export async function getBrandWidgetPayload(shopDomain: string) {
  await ensureShop(shopDomain);
  const [settings, data, reviews] = await Promise.all([
    prisma.widgetSettings.upsert({
      where: { shopDomain },
      update: {},
      create: { shopDomain }
    }),
    prisma.brandWidgetData.upsert({
      where: { shopDomain },
      update: {},
      create: { shopDomain }
    }),
    prisma.brandReview.findMany({
      where: { shopDomain },
      orderBy: { reviewDate: "desc" },
      take: 12
    })
  ]);

  if (reviews.length === 0) {
    await prisma.brandReview.createMany({
      data: [
        {
          shopDomain,
          reviewerName: "Emily R.",
          rating: 5,
          title: "Beautiful furniture and careful delivery",
          content: "The sofa arrived on time, the fabric matched the samples, and support kept us updated throughout.",
          verifiedPurchase: true
        },
        {
          shopDomain,
          reviewerName: "Daniel K.",
          rating: 4,
          title: "Solid quality",
          content: "Assembly was straightforward and the dining table feels sturdy. Delivery tracking could be clearer.",
          verifiedPurchase: true
        },
        {
          shopDomain,
          reviewerName: "Priya S.",
          rating: 5,
          title: "Helpful customer service",
          content: "The team helped confirm dimensions before purchase, which made the whole experience much easier.",
          verifiedPurchase: false
        }
      ]
    });
  }

  const freshReviews =
    reviews.length > 0
      ? reviews
      : await prisma.brandReview.findMany({
          where: { shopDomain },
          orderBy: { reviewDate: "desc" },
          take: 12
        });

  return {
    brandName: data.brandName,
    rating: data.rating,
    reviewCount: data.reviewCount,
    trustScore: data.trustScore,
    summary: settings.showAiSummary ? data.aiSummary : "",
    ratingBreakdown: settings.showRatingBreakdown ? JSON.parse(data.ratingBreakdown) : null,
    profileUrl: data.profileUrl || settings.profileUrl,
    settings,
    reviews: freshReviews
  };
}
