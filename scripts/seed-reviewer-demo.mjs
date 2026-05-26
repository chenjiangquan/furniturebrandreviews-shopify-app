import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const shopDomain = String(process.env.REVIEWER_DEMO_SHOP || process.env.SHOP_DOMAIN || "").trim();

if (!shopDomain) {
  console.error("Missing REVIEWER_DEMO_SHOP. Example: REVIEWER_DEMO_SHOP=your-store.myshopify.com npm run seed:reviewer");
  process.exit(1);
}

const now = new Date();
const demoBrandName = "Furniture Demo Store";
const demoBrandSlug = "furniture-demo-store";
const demoEmail = "reviewtest@furniturebrandreviews.com";
const demoProduct = {
  productId: "reviewer-demo-product-1",
  productHandle: "the-collection-snowboard-liquid",
  productTitle: "The Collection Snowboard: Liquid"
};

const demoReviews = [
  ["Ava Thompson", "ava.reviewer@example.com", 5, "Beautiful finish and easy delivery", "The product arrived carefully packed, looked exactly like the photos, and felt sturdy right away.", "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80", true, "Thank you for sharing your experience. We are glad the delivery and finish met expectations."],
  ["Leo Chen", "leo.reviewer@example.com", 4, "Good quality and helpful support", "Support answered my sizing question quickly. The product feels solid and matches the product page.", "", false, ""],
  ["Mia Roberts", "mia.reviewer@example.com", 5, "Looks great in our room", "The color and texture are exactly what we wanted. Guests have already asked where we bought it.", "", true, ""],
  ["Noah Patel", "noah.reviewer@example.com", 3, "Nice product, delivery could improve", "The product is comfortable and well made, but delivery tracking was not as clear as expected.", "", false, ""],
  ["Sofia Martinez", "sofia.reviewer@example.com", 4, "Comfortable and as described", "Assembly was straightforward and the materials feel durable. Overall a very good purchase.", "", true, ""]
];

const demoQuestions = [
  ["Ethan Brooks", "ethan.question@example.com", "Can this item fit through a narrow hallway?", "Yes. We recommend checking the product dimensions first, and most deliveries can remove packaging before entry.", "PUBLISHED"],
  ["Grace Wilson", "grace.question@example.com", "Is the fabric easy to clean?", "", "PENDING"]
];

await prisma.shop.upsert({
  where: { shopDomain },
  update: {
    storeName: demoBrandName,
    notificationEmail: demoEmail,
    reviewEmailNotificationsEnabled: true,
    questionEmailNotificationsEnabled: true,
    isActive: true
  },
  create: {
    shopDomain,
    storeName: demoBrandName,
    notificationEmail: demoEmail,
    reviewEmailNotificationsEnabled: true,
    questionEmailNotificationsEnabled: true,
    isActive: true
  }
});

await Promise.all([
  prisma.widgetSettings.upsert({
    where: { shopDomain },
    update: { brandName: demoBrandName, brandSlug: demoBrandSlug, profileUrl: "https://www.furniturebrandreviews.com/review/furniture-demo-store" },
    create: { shopDomain, brandName: demoBrandName, brandSlug: demoBrandSlug, profileUrl: "https://www.furniturebrandreviews.com/review/furniture-demo-store" }
  }),
  prisma.brandWidgetData.upsert({
    where: { shopDomain },
    update: { brandName: demoBrandName, profileUrl: "https://www.furniturebrandreviews.com/review/furniture-demo-store" },
    create: { shopDomain, brandName: demoBrandName, profileUrl: "https://www.furniturebrandreviews.com/review/furniture-demo-store" }
  }),
  prisma.productReviewSettings.upsert({
    where: { shopDomain },
    update: { showAskQuestionButton: true, allowPhotoReviews: true, showVerifiedBadge: true, showAiSummary: true },
    create: { shopDomain, showAskQuestionButton: true, allowPhotoReviews: true, showVerifiedBadge: true, showAiSummary: true }
  })
]);

for (const [index, review] of demoReviews.entries()) {
  const [customerName, customerEmail, rating, title, content, imageUrl, verifiedPurchase, merchantReply] = review;
  const existing = await prisma.productReview.findFirst({ where: { shopDomain, customerEmail, title } });
  const data = {
    ...demoProduct,
    customerName,
    customerEmail,
    rating,
    title,
    content,
    imageUrl,
    verifiedPurchase,
    merchantReply,
    repliedAt: merchantReply ? now : null,
    status: "PUBLISHED",
    source: "STOREFRONT",
    createdAt: new Date(now.getTime() - (index + 1) * 86_400_000)
  };
  if (existing) {
    await prisma.productReview.update({ where: { id: existing.id }, data });
  } else {
    await prisma.productReview.create({ data: { shopDomain, ...data } });
  }
}

for (const [index, questionData] of demoQuestions.entries()) {
  const [customerName, customerEmail, question, answer, status] = questionData;
  const existing = await prisma.productQuestion.findFirst({ where: { shopDomain, customerEmail, question } });
  const data = {
    ...demoProduct,
    customerName,
    customerEmail,
    question,
    answer,
    status,
    answeredAt: answer ? now : null,
    createdAt: new Date(now.getTime() - (index + 1) * 43_200_000)
  };
  if (existing) {
    await prisma.productQuestion.update({ where: { id: existing.id }, data });
  } else {
    await prisma.productQuestion.create({ data: { shopDomain, ...data } });
  }
}

const [reviewCount, questionCount] = await Promise.all([
  prisma.productReview.count({ where: { shopDomain } }),
  prisma.productQuestion.count({ where: { shopDomain } })
]);

console.log("Reviewer demo data seeded", { shopDomain, reviewCount, questionCount });
await prisma.$disconnect();
