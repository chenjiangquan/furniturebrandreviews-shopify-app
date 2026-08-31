import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";
import { sendQuestionNotification } from "~/models/notifications.server";
import {
  protectStorefrontQuestionSubmission,
  validateStorefrontQuestionPayload
} from "~/models/storefront-review-protection.server";
import {
  corsJson,
  createProductQuestion,
  requiredString
} from "~/models/reviews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsJson({});

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

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 16_384) {
      throw new Response("Question submission is too large.", { status: 413 });
    }

    const contentType = request.headers.get("content-type") || "";
    const payload = (contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData())) as Record<string, unknown>;
    const shopDomain = requiredString(String(payload.shop || payload.shopDomain || ""), "shop").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/u.test(shopDomain)) {
      throw new Response("Invalid shop domain.", { status: 400 });
    }

    const productId = requiredString(String(payload.productId || ""), "productId");
    const validated = validateStorefrontQuestionPayload(payload);
    await protectStorefrontQuestionSubmission(
      request,
      payload,
      shopDomain,
      productId,
      validated.customerEmail
    );
    const settings = await prisma.productReviewSettings.findUnique({ where: { shopDomain } });

    const question = await createProductQuestion({
      shopDomain,
      productId,
      productHandle: String(payload.productHandle || "").slice(0, 255),
      productTitle: String(payload.productTitle || "").slice(0, 255),
      customerName: validated.customerName,
      customerEmail: validated.customerEmail,
      question: validated.question,
      status: settings?.autoApproveReviews ? "PUBLISHED" : "PENDING"
    });
    // Await the provider request so serverless runtimes do not terminate the
    // invocation before the notification has actually been handed to Resend.
    await sendQuestionNotification(shopDomain, question);

    return corsJson({
      ok: true,
      question,
      status: question.status,
      message: question.status === "PUBLISHED"
        ? "Question submitted and published."
        : "Question submitted and waiting for merchant approval."
    });
  } catch (error) {
    if (error instanceof Response) {
      const headers = new Headers();
      const retryAfter = error.headers.get("Retry-After");
      if (retryAfter) headers.set("Retry-After", retryAfter);
      return corsJson(
        { ok: false, error: await error.text() || "Question could not be submitted." },
        { status: error.status || 500, headers }
      );
    }
    throw error;
  }
};
