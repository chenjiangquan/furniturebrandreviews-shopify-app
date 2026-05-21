import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";
import {
  corsJson,
  createProductQuestion,
  requiredString
} from "~/models/reviews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopDomain = requiredString(url.searchParams.get("shop"), "shop");
  const productId = requiredString(url.searchParams.get("productId"), "productId");
  const questions = await prisma.productQuestion.findMany({
    where: { shopDomain, productId, status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: 25
  });

  return corsJson({ questions });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return corsJson({});

  const contentType = request.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries(await request.formData());
  const shopDomain = requiredString(payload.shop || payload.shopDomain, "shop");
  const settings = await prisma.productReviewSettings.findUnique({ where: { shopDomain } });

  const question = await createProductQuestion({
    shopDomain,
    productId: requiredString(payload.productId, "productId"),
    productHandle: String(payload.productHandle || ""),
    productTitle: String(payload.productTitle || ""),
    customerName: requiredString(payload.customerName || payload.name, "name"),
    customerEmail: String(payload.customerEmail || payload.email || ""),
    question: requiredString(payload.question, "question"),
    status: settings?.autoApproveReviews ? "PUBLISHED" : "PENDING"
  });

  return corsJson({
    ok: true,
    question,
    status: question.status,
    message: question.status === "PUBLISHED"
      ? "Question submitted and published."
      : "Question submitted and waiting for merchant approval."
  });
};
