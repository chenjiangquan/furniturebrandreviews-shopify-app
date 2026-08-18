import { Prisma, type ProductQuestion, type ProductReview } from "@prisma/client";
import prisma from "~/db.server";
import { defaultProductReviewWidgetSettings } from "~/models/product-review-widget-settings";

const productReviewCreateLocks = new Map<string, Promise<ProductReview>>();
const productQuestionCreateLocks = new Map<string, Promise<ProductQuestion>>();
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
  const existingSettings = await prisma.productReviewSettings.findUnique({ where: { shopDomain } });
  if (existingSettings) return existingSettings;

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

const genericProductWords = new Set([
  "and",
  "the",
  "with",
  "for",
  "from",
  "product"
]);

function productMatchTokens(...values: Array<string | null | undefined>) {
  const tokens = new Set<string>();
  for (const value of values) {
    for (const token of normalizeProductTitle(value).split(" ")) {
      if (token.length >= 4 && !genericProductWords.has(token)) {
        tokens.add(token);
      }
    }
  }
  return [...tokens];
}

function productCandidateWhere(productHandle: string, productTitle: string): Prisma.ProductReviewWhereInput {
  const tokens = productMatchTokens(productHandle, productTitle);
  if (!tokens.length) {
    return {
      OR: [
        { productTitle: { not: "" } },
        { productHandle: { not: "" } }
      ]
    };
  }

  return {
    AND: tokens.map((token) => ({
      OR: [
        { productTitle: { contains: token, mode: "insensitive" } },
        { productHandle: { contains: token, mode: "insensitive" } }
      ]
    }))
  };
}

function reviewMatchesCurrentProduct(
  review: Pick<ProductReview, "productTitle" | "productHandle">,
  normalizedCurrentTitle: string,
  currentTokens: string[]
) {
  const normalizedReviewTitle = normalizeProductTitle(review.productTitle);
  const normalizedReviewHandle = normalizeProductTitle(review.productHandle);
  const haystacks = [normalizedReviewTitle, normalizedReviewHandle].filter(Boolean);

  if (
    normalizedCurrentTitle &&
    haystacks.some((haystack) =>
      haystack === normalizedCurrentTitle ||
      haystack.includes(normalizedCurrentTitle) ||
      normalizedCurrentTitle.includes(haystack)
    )
  ) {
    return true;
  }

  if (!currentTokens.length) {
    return false;
  }

  const reviewTokens = new Set(haystacks.flatMap((value) => value.split(" ")));
  return currentTokens.every((token) => reviewTokens.has(token));
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
  const currentTokens = productMatchTokens(productHandle, productTitle);
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

  // The production Prisma pool intentionally starts at one connection per
  // serverless instance. Keep these fallback reads serial so the second query
  // does not wait in Prisma's queue and trigger P2024 during a slow review read.
  const directPublishedReviews = await prisma.productReview.findMany({
    where: {
      shopDomain,
      status: { in: publishedReviewStatuses },
      ...(reviewMatchFilters.length ? { OR: reviewMatchFilters } : { id: "__no_product_match__" })
    },
    orderBy: { createdAt: "desc" }
  });
  const questions = await prisma.productQuestion.findMany({
    where: {
      shopDomain,
      status: "PUBLISHED",
      ...(questionMatchFilters.length ? { OR: questionMatchFilters } : { id: "__no_product_match__" })
    },
    orderBy: { createdAt: "desc" },
    take: 25
  });
  const titleFallbackReviews = directPublishedReviews.length === 0 && (normalizedCurrentTitle || currentTokens.length > 0)
    ? await prisma.productReview.findMany({
        where: {
          shopDomain,
          status: { in: publishedReviewStatuses },
          ...productCandidateWhere(productHandle, productTitle)
        },
        orderBy: { createdAt: "desc" },
        take: 2500
      })
    : [];
  const reviewMap = new Map<string, ProductReview>();
  for (const review of directPublishedReviews) {
    reviewMap.set(review.id, review);
  }
  for (const review of titleFallbackReviews) {
    if (reviewMatchesCurrentProduct(review, normalizedCurrentTitle, currentTokens)) {
      reviewMap.set(review.id, review);
    }
  }

  const reviews = [...reviewMap.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const ratingTotal = reviews.reduce((total, review) => total + review.rating, 0);

  return {
    averageRating: Number((reviews.length ? ratingTotal / reviews.length : 0).toFixed(1)),
    reviewCount: reviews.length,
    reviews: reviews.map(publicProductReview),
    questions
  };
}

type PublicProductReviewBundleRow = {
  reviews: ProductReview[];
  questions: ProductQuestion[];
  settings: Awaited<ReturnType<typeof getProductReviewWidgetSettings>> | null;
  seoRichSnippetsEnabled: boolean | null;
  plan: string | null;
};

type PublicProductReviewRatingBundleRow = {
  averageRating: number | string | null;
  reviewCount: bigint | number | string;
  settings: Awaited<ReturnType<typeof getProductReviewWidgetSettings>> | null;
  seoRichSnippetsEnabled: boolean | null;
  plan: string | null;
};

/**
 * Loads only the aggregate needed by the star badge. Keeping this separate
 * prevents summary-only storefront requests from reading every review row and
 * potentially large image payloads.
 */
export async function getProductReviewPublicRatingBundle(
  shopDomain: string,
  productId: string,
  productHandle = "",
  productTitle = ""
) {
  const reviewMatches: Prisma.Sql[] = [];
  if (productId) reviewMatches.push(Prisma.sql`r."productId" = ${productId}`);
  if (productHandle) reviewMatches.push(Prisma.sql`r."productHandle" = ${productHandle}`);
  if (productTitle) reviewMatches.push(Prisma.sql`r."productTitle" = ${productTitle}`);

  const reviewWhere = reviewMatches.length
    ? Prisma.sql`(${Prisma.join(reviewMatches, " OR ")})`
    : Prisma.sql`FALSE`;
  const statuses = Prisma.join(publishedReviewStatuses);
  const rows = await prisma.$queryRaw<PublicProductReviewRatingBundleRow[]>(Prisma.sql`
    SELECT
      review_stats."averageRating",
      review_stats."reviewCount",
      (SELECT to_jsonb(settings_row) FROM "ProductReviewSettings" settings_row WHERE settings_row."shopDomain" = ${shopDomain}) AS settings,
      (SELECT seo."seoRichSnippetsEnabled" FROM "GoogleSeoSettings" seo WHERE seo."shopDomain" = ${shopDomain}) AS "seoRichSnippetsEnabled",
      (SELECT subscription."plan" FROM "SubscriptionSettings" subscription WHERE subscription."shopDomain" = ${shopDomain}) AS plan
    FROM (
      SELECT
        COALESCE(AVG(r."rating"), 0) AS "averageRating",
        COUNT(*) AS "reviewCount"
      FROM "ProductReview" r
      WHERE r."shopDomain" = ${shopDomain}
        AND r."status" IN (${statuses})
        AND ${reviewWhere}
    ) review_stats
  `);
  const row = rows[0] || {
    averageRating: 0,
    reviewCount: 0,
    settings: null,
    seoRichSnippetsEnabled: false,
    plan: null
  };

  return {
    summary: {
      averageRating: Number(Number(row.averageRating || 0).toFixed(1)),
      reviewCount: Number(row.reviewCount || 0)
    },
    settings: row.settings,
    seoRichSnippetsEnabled: Boolean(row.seoRichSnippetsEnabled),
    plan: row.plan
  };
}

/**
 * Loads the public widget payload in one database round trip. The storefront
 * endpoint used to issue separate review, question, settings, SEO and plan
 * queries. That is especially expensive through a remote pooled database.
 */
export async function getProductReviewPublicBundle(
  shopDomain: string,
  productId: string,
  productHandle = "",
  productTitle = ""
) {
  const reviewMatches: Prisma.Sql[] = [];
  const questionMatches: Prisma.Sql[] = [];
  if (productId) {
    reviewMatches.push(Prisma.sql`r."productId" = ${productId}`);
    questionMatches.push(Prisma.sql`q."productId" = ${productId}`);
  }
  if (productHandle) {
    reviewMatches.push(Prisma.sql`r."productHandle" = ${productHandle}`);
    questionMatches.push(Prisma.sql`q."productHandle" = ${productHandle}`);
  }
  if (productTitle) {
    reviewMatches.push(Prisma.sql`r."productTitle" = ${productTitle}`);
    questionMatches.push(Prisma.sql`q."productTitle" = ${productTitle}`);
  }

  const reviewWhere = reviewMatches.length
    ? Prisma.sql`(${Prisma.join(reviewMatches, " OR ")})`
    : Prisma.sql`FALSE`;
  const questionWhere = questionMatches.length
    ? Prisma.sql`(${Prisma.join(questionMatches, " OR ")})`
    : Prisma.sql`FALSE`;
  const statuses = Prisma.join(publishedReviewStatuses);

  const rows = await prisma.$queryRaw<PublicProductReviewBundleRow[]>(Prisma.sql`
    SELECT
      COALESCE((
        SELECT jsonb_agg(to_jsonb(reviews_row) ORDER BY reviews_row."createdAt" DESC)
        FROM (
          SELECT r.*
          FROM "ProductReview" r
          WHERE r."shopDomain" = ${shopDomain}
            AND r."status" IN (${statuses})
            AND ${reviewWhere}
          ORDER BY r."createdAt" DESC
        ) reviews_row
      ), '[]'::jsonb) AS reviews,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(questions_row) ORDER BY questions_row."createdAt" DESC)
        FROM (
          SELECT q.*
          FROM "ProductQuestion" q
          WHERE q."shopDomain" = ${shopDomain}
            AND q."status" = 'PUBLISHED'
            AND ${questionWhere}
          ORDER BY q."createdAt" DESC
          LIMIT 25
        ) questions_row
      ), '[]'::jsonb) AS questions,
      (SELECT to_jsonb(settings_row) FROM "ProductReviewSettings" settings_row WHERE settings_row."shopDomain" = ${shopDomain}) AS settings,
      (SELECT seo."seoRichSnippetsEnabled" FROM "GoogleSeoSettings" seo WHERE seo."shopDomain" = ${shopDomain}) AS "seoRichSnippetsEnabled",
      (SELECT subscription."plan" FROM "SubscriptionSettings" subscription WHERE subscription."shopDomain" = ${shopDomain}) AS plan
  `);

  const row = rows[0] || {
    reviews: [],
    questions: [],
    settings: null,
    seoRichSnippetsEnabled: false,
    plan: null
  };
  const reviews = Array.isArray(row.reviews) ? row.reviews : [];
  const questions = Array.isArray(row.questions) ? row.questions : [];
  const ratingTotal = reviews.reduce((total, review) => total + Number(review.rating || 0), 0);

  return {
    summary: {
      averageRating: Number((reviews.length ? ratingTotal / reviews.length : 0).toFixed(1)),
      reviewCount: reviews.length,
      reviews: reviews.map(publicProductReview),
      questions
    },
    settings: row.settings,
    seoRichSnippetsEnabled: Boolean(row.seoRichSnippetsEnabled),
    plan: row.plan
  };
}

export async function getProductReviewRatingSummary(
  shopDomain: string,
  productId: string,
  productHandle = "",
  productTitle = ""
) {
  const normalizedCurrentTitle = normalizeProductTitle(productTitle);
  const currentTokens = productMatchTokens(productHandle, productTitle);
  const reviewMatchFilters: Prisma.ProductReviewWhereInput[] = [];

  if (productId) {
    reviewMatchFilters.push({ productId });
  }
  if (productHandle) {
    reviewMatchFilters.push({ productHandle });
  }
  if (productTitle) {
    reviewMatchFilters.push({ productTitle });
  }

  const directPublishedReviews = await prisma.productReview.findMany({
    where: {
      shopDomain,
      status: { in: publishedReviewStatuses },
      ...(reviewMatchFilters.length ? { OR: reviewMatchFilters } : { id: "__no_product_match__" })
    },
    select: { id: true, rating: true, productTitle: true, productHandle: true }
  });
  const titleFallbackReviews = directPublishedReviews.length === 0 && (normalizedCurrentTitle || currentTokens.length > 0)
    ? await prisma.productReview.findMany({
        where: {
          shopDomain,
          status: { in: publishedReviewStatuses },
          ...productCandidateWhere(productHandle, productTitle)
        },
        select: { id: true, rating: true, productTitle: true, productHandle: true },
        take: 2500
      })
    : [];

  const reviewMap = new Map<string, { id: string; rating: number; productTitle: string | null; productHandle: string | null }>();
  for (const review of directPublishedReviews) {
    reviewMap.set(review.id, review);
  }
  for (const review of titleFallbackReviews) {
    if (reviewMatchesCurrentProduct(review, normalizedCurrentTitle, currentTokens)) {
      reviewMap.set(review.id, review);
    }
  }

  const reviews = [...reviewMap.values()];
  const ratingTotal = reviews.reduce((total, review) => total + review.rating, 0);

  return {
    averageRating: Number((reviews.length ? ratingTotal / reviews.length : 0).toFixed(1)),
    reviewCount: reviews.length
  };
}

function publicProductReview(review: ProductReview) {
  return {
    ...review,
    imageUrl: review.imageHidden ? "" : review.imageUrl
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
    status: "PUBLISHED"
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
