import prisma from "~/db.server";

type ShopifyGdprPayload = {
  shop_domain?: string;
  customer?: {
    id?: number | string;
    email?: string;
    phone?: string;
  };
  data_request?: {
    id?: number | string;
  };
  orders_requested?: Array<number | string>;
};

export async function handleAppUninstalled(shopDomain: string) {
  console.log("[webhook] APP_UNINSTALLED received", { shopDomain });
  await prisma.session.deleteMany({ where: { shop: shopDomain } });
  await prisma.shop.upsert({
    where: { shopDomain },
    update: {
      accessToken: null,
      scope: null,
      isActive: false,
      uninstalledAt: new Date()
    },
    create: {
      shopDomain,
      accessToken: null,
      scope: null,
      isActive: false,
      uninstalledAt: new Date()
    }
  });
  console.log("[webhook] APP_UNINSTALLED completed", { shopDomain });
}

export async function handleCustomersDataRequest(shopDomain: string, payload: unknown) {
  const gdprPayload = payload as ShopifyGdprPayload;
  const customerEmail = normalizeEmail(gdprPayload.customer?.email);
  const [reviewCount, questionCount] = customerEmail
    ? await Promise.all([
        prisma.productReview.count({ where: { shopDomain, customerEmail } }),
        prisma.productQuestion.count({ where: { shopDomain, customerEmail } })
      ])
    : [0, 0];

  console.log("[webhook] CUSTOMERS_DATA_REQUEST received", {
    shopDomain,
    customerId: gdprPayload.customer?.id || null,
    customerEmail: customerEmail || null,
    dataRequestId: gdprPayload.data_request?.id || null,
    matchingProductReviews: reviewCount,
    matchingProductQuestions: questionCount
  });
}

export async function handleCustomersRedact(shopDomain: string, payload: unknown) {
  const gdprPayload = payload as ShopifyGdprPayload;
  const customerEmail = normalizeEmail(gdprPayload.customer?.email);
  console.log("[webhook] CUSTOMERS_REDACT received", {
    shopDomain,
    customerId: gdprPayload.customer?.id || null,
    customerEmail: customerEmail || null
  });

  if (!customerEmail) {
    console.log("[webhook] CUSTOMERS_REDACT skipped because no stored customer email was provided", { shopDomain });
    return;
  }

  const [reviews, questions] = await prisma.$transaction([
    prisma.productReview.updateMany({
      where: { shopDomain, customerEmail },
      data: {
        customerName: "Redacted customer",
        customerEmail: ""
      }
    }),
    prisma.productQuestion.updateMany({
      where: { shopDomain, customerEmail },
      data: {
        customerName: "Redacted customer",
        customerEmail: ""
      }
    })
  ]);

  console.log("[webhook] CUSTOMERS_REDACT completed", {
    shopDomain,
    redactedProductReviews: reviews.count,
    redactedProductQuestions: questions.count
  });
}

export async function handleShopRedact(shopDomain: string) {
  console.log("[webhook] SHOP_REDACT received", { shopDomain });
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { shop: shopDomain } }),
    prisma.productReview.deleteMany({ where: { shopDomain } }),
    prisma.productQuestion.deleteMany({ where: { shopDomain } }),
    prisma.brandReview.deleteMany({ where: { shopDomain } }),
    prisma.productReviewSettings.deleteMany({ where: { shopDomain } }),
    prisma.googleSeoSettings.deleteMany({ where: { shopDomain } }),
    prisma.subscriptionSettings.deleteMany({ where: { shopDomain } }),
    prisma.brandWidgetData.deleteMany({ where: { shopDomain } }),
    prisma.widgetSettings.deleteMany({ where: { shopDomain } }),
    prisma.shop.deleteMany({ where: { shopDomain } })
  ]);
  console.log("[webhook] SHOP_REDACT completed", { shopDomain });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}
