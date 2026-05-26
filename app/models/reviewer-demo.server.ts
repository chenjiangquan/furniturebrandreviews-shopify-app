import prisma from "~/db.server";

const demoBrandName = "Furniture Demo Store";
const demoBrandSlug = "furniture-demo-store";
const demoEmail = "reviewtest@furniturebrandreviews.com";
const demoProduct = {
  productId: "reviewer-demo-product-1",
  productHandle: "the-collection-snowboard-liquid",
  productTitle: "The Collection Snowboard: Liquid"
};

const demoReviews = [
  {
    customerName: "Ava Thompson",
    customerEmail: "ava.reviewer@example.com",
    rating: 5,
    title: "Beautiful finish and easy delivery",
    content: "The product arrived carefully packed, looked exactly like the photos, and felt sturdy right away.",
    imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80",
    verifiedPurchase: true,
    merchantReply: "Thank you for sharing your experience. We are glad the delivery and finish met expectations."
  },
  {
    customerName: "Leo Chen",
    customerEmail: "leo.reviewer@example.com",
    rating: 4,
    title: "Good quality and helpful support",
    content: "Support answered my sizing question quickly. The product feels solid and matches the product page.",
    imageUrl: "",
    verifiedPurchase: false,
    merchantReply: ""
  },
  {
    customerName: "Mia Roberts",
    customerEmail: "mia.reviewer@example.com",
    rating: 5,
    title: "Looks great in our room",
    content: "The color and texture are exactly what we wanted. Guests have already asked where we bought it.",
    imageUrl: "",
    verifiedPurchase: true,
    merchantReply: ""
  },
  {
    customerName: "Noah Patel",
    customerEmail: "noah.reviewer@example.com",
    rating: 3,
    title: "Nice product, delivery could improve",
    content: "The product is comfortable and well made, but delivery tracking was not as clear as expected.",
    imageUrl: "",
    verifiedPurchase: false,
    merchantReply: ""
  },
  {
    customerName: "Sofia Martinez",
    customerEmail: "sofia.reviewer@example.com",
    rating: 4,
    title: "Comfortable and as described",
    content: "Assembly was straightforward and the materials feel durable. Overall a very good purchase.",
    imageUrl: "",
    verifiedPurchase: true,
    merchantReply: ""
  }
];

const demoQuestions = [
  {
    customerName: "Ethan Brooks",
    customerEmail: "ethan.question@example.com",
    question: "Can this item fit through a narrow hallway?",
    answer: "Yes. We recommend checking the product dimensions first, and most deliveries can remove packaging before entry.",
    status: "PUBLISHED"
  },
  {
    customerName: "Grace Wilson",
    customerEmail: "grace.question@example.com",
    question: "Is the fabric easy to clean?",
    answer: "",
    status: "PENDING"
  }
] as const;

export async function seedReviewerDemoData(shopDomain: string) {
  const now = new Date();
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
      update: {
        brandName: demoBrandName,
        brandSlug: demoBrandSlug,
        profileUrl: "https://www.furniturebrandreviews.com/review/furniture-demo-store"
      },
      create: {
        shopDomain,
        brandName: demoBrandName,
        brandSlug: demoBrandSlug,
        profileUrl: "https://www.furniturebrandreviews.com/review/furniture-demo-store"
      }
    }),
    prisma.brandWidgetData.upsert({
      where: { shopDomain },
      update: {
        brandName: demoBrandName,
        profileUrl: "https://www.furniturebrandreviews.com/review/furniture-demo-store"
      },
      create: {
        shopDomain,
        brandName: demoBrandName,
        profileUrl: "https://www.furniturebrandreviews.com/review/furniture-demo-store"
      }
    }),
    prisma.productReviewSettings.upsert({
      where: { shopDomain },
      update: {
        showAskQuestionButton: true,
        allowPhotoReviews: true,
        showVerifiedBadge: true,
        showAiSummary: true
      },
      create: {
        shopDomain,
        showAskQuestionButton: true,
        allowPhotoReviews: true,
        showVerifiedBadge: true,
        showAiSummary: true
      }
    })
  ]);

  for (const [index, review] of demoReviews.entries()) {
    const existing = await prisma.productReview.findFirst({
      where: {
        shopDomain,
        customerEmail: review.customerEmail,
        title: review.title
      }
    });

    const data = {
      ...demoProduct,
      customerName: review.customerName,
      customerEmail: review.customerEmail,
      rating: review.rating,
      title: review.title,
      content: review.content,
      imageUrl: review.imageUrl,
      verifiedPurchase: review.verifiedPurchase,
      merchantReply: review.merchantReply,
      repliedAt: review.merchantReply ? now : null,
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

  for (const [index, question] of demoQuestions.entries()) {
    const existing = await prisma.productQuestion.findFirst({
      where: {
        shopDomain,
        customerEmail: question.customerEmail,
        question: question.question
      }
    });

    const data = {
      ...demoProduct,
      customerName: question.customerName,
      customerEmail: question.customerEmail,
      question: question.question,
      answer: question.answer,
      status: question.status,
      answeredAt: question.answer ? now : null,
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

  console.log("[reviewer-demo] Seeded demo data", { shopDomain, reviewCount, questionCount });
  return { reviewCount, questionCount };
}
