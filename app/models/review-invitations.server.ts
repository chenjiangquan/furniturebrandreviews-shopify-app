import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import { getShopEntitlements } from "~/models/entitlements.server";
import {
  cancelScheduledEmail,
  sendAppOwnerReviewNotification,
  sendReviewInvitationRequestEmail,
  sendReviewNotification
} from "~/models/notifications.server";
import { clearPublicWidgetCache } from "~/models/public-widget-cache.server";

export const FREE_MONTHLY_INVITATION_LIMIT = 30;
export const PRO_MONTHLY_INVITATION_LIMIT = 500;
const MAX_PRODUCTS_PER_INVITATION = 3;
const INVITATION_LIFETIME_DAYS = 180;

type FulfilledOrderPayload = {
  id?: number | string;
  name?: string;
  email?: string;
  contact_email?: string;
  customer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  line_items?: Array<{
    product_id?: number | string | null;
    title?: string;
    name?: string;
    variant_title?: string | null;
  }>;
};

type InvitationEmailEvent = {
  type: string;
  createdAt: Date;
  emailId: string;
};

export async function getReviewInvitationSettings(shopDomain: string) {
  await prisma.shop.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain }
  });
  return prisma.reviewInvitationSettings.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain }
  });
}

export async function saveReviewInvitationSettings(
  shopDomain: string,
  input: {
    enabled: boolean;
    delayDays: number;
    reminderEnabled: boolean;
    reminderDays: number;
    emailSubject: string;
    emailHeading: string;
    emailBody: string;
  }
) {
  const settings = await prisma.reviewInvitationSettings.upsert({
    where: { shopDomain },
    update: input,
    create: { shopDomain, ...input }
  });
  if (!settings.enabled) await cancelAllScheduledReviewInvitations(shopDomain);
  return settings;
}

export async function scheduleReviewInvitationForFulfilledOrder(
  shopDomain: string,
  payload: unknown
) {
  const order = payload as FulfilledOrderPayload;
  const settings = await getReviewInvitationSettings(shopDomain);
  if (!settings.enabled) return { state: "disabled" as const };

  const shopifyOrderId = String(order.id || "").trim();
  if (!shopifyOrderId) return { state: "missing-order" as const };

  const existing = await prisma.reviewInvitation.findUnique({
    where: { shopDomain_shopifyOrderId: { shopDomain, shopifyOrderId } }
  });
  if (existing) return { state: "existing" as const, invitation: existing };

  const customerEmail = normalizeEmail(order.email || order.contact_email || order.customer?.email);
  if (!isEmail(customerEmail)) return { state: "missing-email" as const };

  const productMap = new Map<string, { productId: string; productTitle: string; variantTitle: string }>();
  for (const lineItem of order.line_items || []) {
    const productId = String(lineItem.product_id || "").trim();
    const productTitle = String(lineItem.title || lineItem.name || "").trim();
    if (!productId || !productTitle || productMap.has(productId)) continue;
    productMap.set(productId, {
      productId,
      productTitle: productTitle.slice(0, 255),
      variantTitle: String(lineItem.variant_title || "").trim().slice(0, 255)
    });
    if (productMap.size >= MAX_PRODUCTS_PER_INVITATION) break;
  }
  const products = [...productMap.values()];
  if (!products.length) return { state: "missing-products" as const };

  const [suppression, entitlements] = await Promise.all([
    prisma.reviewInvitationSuppression.findUnique({
      where: { shopDomain_customerEmail: { shopDomain, customerEmail } }
    }),
    getShopEntitlements(shopDomain)
  ]);
  const monthlyLimit = entitlements.isPro
    ? PRO_MONTHLY_INVITATION_LIMIT
    : FREE_MONTHLY_INVITATION_LIMIT;
  const monthlyCount = await prisma.reviewInvitation.count({
    where: {
      shopDomain,
      createdAt: { gte: startOfUtcMonth() },
      status: { notIn: ["SKIPPED", "CANCELLED", "UNSUBSCRIBED"] }
    }
  });
  const skipReason = suppression
    ? "Customer unsubscribed"
    : monthlyCount >= monthlyLimit
      ? `Monthly ${entitlements.isPro ? "Pro" : "Free"} plan limit reached`
      : "";
  const scheduledAt = addDays(new Date(), clamp(settings.delayDays, 1, 21));
  const expiresAt = addDays(new Date(), INVITATION_LIFETIME_DAYS);
  const customerName = [order.customer?.first_name, order.customer?.last_name]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 100);

  const invitation = await prisma.reviewInvitation.create({
    data: {
      shopDomain,
      shopifyOrderId,
      orderName: String(order.name || "").trim().slice(0, 100),
      customerEmail,
      customerName,
      status: skipReason ? "SKIPPED" : "SCHEDULING",
      skipReason,
      scheduledAt,
      expiresAt,
      items: { create: products }
    },
    include: { items: true, shop: true }
  });
  if (skipReason) return { state: "skipped" as const, invitation };

  return scheduleInvitationEmails(invitation, settings);
}

async function scheduleInvitationEmails(
  invitation: Awaited<ReturnType<typeof invitationWithDetails>>,
  settings: Awaited<ReturnType<typeof getReviewInvitationSettings>>
) {
  const token = reviewInvitationToken(invitation.id);
  const initial = await sendReviewInvitationRequestEmail({
    to: invitation.customerEmail,
    replyTo: merchantReplyTo(invitation.shop),
    subject: settings.emailSubject,
    heading: settings.emailHeading,
    body: settings.emailBody,
    storeName: invitation.shop.storeName || invitation.shopDomain,
    shopDomain: invitation.shopDomain,
    orderName: invitation.orderName,
    products: invitation.items.map((item) => ({
      title: item.productTitle,
      variantTitle: item.variantTitle
    })),
    reviewUrl: invitationPublicUrl(token),
    unsubscribeUrl: invitationUnsubscribeUrl(token),
    scheduledAt: invitation.scheduledAt,
    idempotencyKey: `review-invitation/${invitation.id}/initial`
  }).catch(async (error) => {
    await prisma.reviewInvitation.update({
      where: { id: invitation.id },
      data: { status: "FAILED", skipReason: errorMessage(error).slice(0, 500) }
    });
    throw error;
  });

  let reminderResendEmailId: string | null = null;
  if (settings.reminderEnabled) {
    const reminderAt = addDays(invitation.scheduledAt, clamp(settings.reminderDays, 1, 7));
    if (reminderAt.getTime() <= addDays(new Date(), 30).getTime()) {
      try {
        const reminder = await sendReviewInvitationRequestEmail({
          to: invitation.customerEmail,
          replyTo: merchantReplyTo(invitation.shop),
          subject: settings.emailSubject,
          heading: settings.emailHeading,
          body: settings.emailBody,
          storeName: invitation.shop.storeName || invitation.shopDomain,
          shopDomain: invitation.shopDomain,
          orderName: invitation.orderName,
          products: invitation.items.map((item) => ({
            title: item.productTitle,
            variantTitle: item.variantTitle
          })),
          reviewUrl: invitationPublicUrl(token),
          unsubscribeUrl: invitationUnsubscribeUrl(token),
          scheduledAt: reminderAt,
          idempotencyKey: `review-invitation/${invitation.id}/reminder`,
          reminder: true
        });
        reminderResendEmailId = reminder.id;
      } catch (error) {
        console.error("Review invitation reminder could not be scheduled", {
          invitationId: invitation.id,
          error: errorMessage(error)
        });
      }
    }
  }

  const saved = await prisma.reviewInvitation.update({
    where: { id: invitation.id },
    data: {
      status: "SCHEDULED",
      skipReason: "",
      resendEmailId: initial.id,
      reminderResendEmailId
    }
  });
  return { state: "scheduled" as const, invitation: saved };
}

function invitationWithDetails(invitationId: string) {
  return prisma.reviewInvitation.findUniqueOrThrow({
    where: { id: invitationId },
    include: { items: true, shop: true }
  });
}

export async function sendReviewInvitationNow(shopDomain: string, invitationId: string) {
  const invitation = await prisma.reviewInvitation.findFirst({
    where: { id: invitationId, shopDomain },
    include: { items: true, shop: true }
  });
  if (!invitation) throw new Response("Invitation not found.", { status: 404 });
  if (invitation.status === "SCHEDULED" && invitation.scheduledAt.getTime() <= Date.now()) {
    throw new Response("This invitation has already been sent.", { status: 400 });
  }
  if (["REVIEWED", "CANCELLED", "UNSUBSCRIBED"].includes(invitation.status)) {
    throw new Response("This invitation can no longer be sent.", { status: 400 });
  }

  await Promise.all([
    invitation.resendEmailId ? cancelScheduledEmail(invitation.resendEmailId) : Promise.resolve(),
    invitation.reminderResendEmailId ? cancelScheduledEmail(invitation.reminderResendEmailId) : Promise.resolve()
  ]);
  const settings = await getReviewInvitationSettings(shopDomain);
  const token = reviewInvitationToken(invitation.id);
  const result = await sendReviewInvitationRequestEmail({
    to: invitation.customerEmail,
    replyTo: merchantReplyTo(invitation.shop),
    subject: settings.emailSubject,
    heading: settings.emailHeading,
    body: settings.emailBody,
    storeName: invitation.shop.storeName || invitation.shopDomain,
    shopDomain: invitation.shopDomain,
    orderName: invitation.orderName,
    products: invitation.items.map((item) => ({ title: item.productTitle, variantTitle: item.variantTitle })),
    reviewUrl: invitationPublicUrl(token),
    unsubscribeUrl: invitationUnsubscribeUrl(token),
    idempotencyKey: `review-invitation/${invitation.id}/send-now`
  });
  return prisma.reviewInvitation.update({
    where: { id: invitation.id },
    data: {
      status: "SENT",
      skipReason: "",
      scheduledAt: new Date(),
      sentAt: new Date(),
      resendEmailId: result.id,
      reminderResendEmailId: null
    }
  });
}

export async function cancelReviewInvitation(shopDomain: string, invitationId: string) {
  const invitation = await prisma.reviewInvitation.findFirst({
    where: { id: invitationId, shopDomain }
  });
  if (!invitation) throw new Response("Invitation not found.", { status: 404 });
  if (invitation.status === "SCHEDULED" && invitation.scheduledAt.getTime() <= Date.now()) {
    throw new Response("This invitation has already been sent.", { status: 400 });
  }
  if (!["SCHEDULING", "SCHEDULED", "FAILED"].includes(invitation.status)) {
    throw new Response("This invitation can no longer be cancelled.", { status: 400 });
  }
  await cancelInvitationEmailIds(invitation);
  return prisma.reviewInvitation.update({
    where: { id: invitation.id },
    data: { status: "CANCELLED", cancelledAt: new Date() }
  });
}

export async function cancelReviewInvitationsForOrder(shopDomain: string, shopifyOrderId: string) {
  const invitation = await prisma.reviewInvitation.findUnique({
    where: { shopDomain_shopifyOrderId: { shopDomain, shopifyOrderId } }
  });
  if (!invitation || ["REVIEWED", "CANCELLED", "UNSUBSCRIBED"].includes(invitation.status)) return;
  await cancelInvitationEmailIds(invitation);
  await prisma.reviewInvitation.update({
    where: { id: invitation.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), skipReason: "Order cancelled or refunded" }
  });
}

export async function cancelAllScheduledReviewInvitations(shopDomain: string) {
  const invitations = await prisma.reviewInvitation.findMany({
    where: { shopDomain, status: { in: ["SCHEDULING", "SCHEDULED", "FAILED"] } }
  });
  for (const invitation of invitations) {
    await cancelInvitationEmailIds(invitation);
  }
  if (invitations.length) {
    await prisma.reviewInvitation.updateMany({
      where: { id: { in: invitations.map((invitation) => invitation.id) } },
      data: { status: "CANCELLED", cancelledAt: new Date(), skipReason: "Automatic invitations disabled" }
    });
  }
}

async function cancelInvitationEmailIds(invitation: {
  resendEmailId: string | null;
  reminderResendEmailId: string | null;
}) {
  await Promise.all([
    invitation.resendEmailId ? cancelScheduledEmail(invitation.resendEmailId) : Promise.resolve(),
    invitation.reminderResendEmailId ? cancelScheduledEmail(invitation.reminderResendEmailId) : Promise.resolve()
  ]);
}

export async function getPublicReviewInvitation(token: string) {
  const invitationId = verifiedInvitationId(token);
  const invitation = await prisma.reviewInvitation.findUnique({
    where: { id: invitationId },
    include: { items: { include: { review: true } }, shop: true }
  });
  if (!invitation || invitation.expiresAt.getTime() < Date.now()) {
    throw new Response("This review invitation has expired.", { status: 410 });
  }
  return invitation;
}

export async function unsubscribeReviewInvitation(token: string) {
  const invitation = await getPublicReviewInvitation(token);
  await cancelInvitationEmailIds(invitation);
  await prisma.$transaction([
    prisma.reviewInvitationSuppression.upsert({
      where: {
        shopDomain_customerEmail: {
          shopDomain: invitation.shopDomain,
          customerEmail: invitation.customerEmail
        }
      },
      update: { reason: "Customer unsubscribed" },
      create: {
        shopDomain: invitation.shopDomain,
        customerEmail: invitation.customerEmail,
        reason: "Customer unsubscribed"
      }
    }),
    prisma.reviewInvitation.update({
      where: { id: invitation.id },
      data: { status: "UNSUBSCRIBED", cancelledAt: new Date() }
    })
  ]);
  return invitation;
}

export async function createReviewFromInvitation(
  token: string,
  input: {
    itemId: string;
    customerName: string;
    rating: number;
    title: string;
    content: string;
  }
) {
  const invitation = await getPublicReviewInvitation(token);
  if (["CANCELLED", "UNSUBSCRIBED", "SKIPPED"].includes(invitation.status)) {
    throw new Response("This review invitation is no longer active.", { status: 410 });
  }
  const item = invitation.items.find((candidate) => candidate.id === input.itemId);
  if (!item) throw new Response("Product not found in this invitation.", { status: 404 });
  if (item.review) return { review: item.review, created: false, invitation };

  const customerName = input.customerName.trim().slice(0, 100) || invitation.customerName || "Verified customer";
  let review;
  let created = true;
  try {
    review = await prisma.productReview.create({
      data: {
        shopDomain: invitation.shopDomain,
        productId: item.productId,
        productHandle: item.productHandle,
        productTitle: item.productTitle,
        customerName,
        customerEmail: invitation.customerEmail,
        rating: clamp(input.rating, 1, 5),
        title: input.title.trim().slice(0, 160),
        content: input.content.trim().slice(0, 5000),
        source: "INVITATION",
        verifiedPurchase: true,
        status: "PUBLISHED",
        reviewInvitationItemId: item.id
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    review = await prisma.productReview.findUniqueOrThrow({
      where: { reviewInvitationItemId: item.id }
    });
    created = false;
  }

  const reviewedCount = await prisma.productReview.count({
    where: { reviewInvitationItem: { invitationId: invitation.id } }
  });
  const completed = reviewedCount >= invitation.items.length;
  if (completed && invitation.reminderResendEmailId) {
    await cancelScheduledEmail(invitation.reminderResendEmailId);
  }
  await prisma.reviewInvitation.update({
    where: { id: invitation.id },
    data: {
      status: completed ? "REVIEWED" : "IN_PROGRESS",
      reviewedAt: completed ? new Date() : null,
      reminderResendEmailId: completed ? null : invitation.reminderResendEmailId
    }
  });
  clearPublicWidgetCache(invitation.shopDomain);
  if (created) {
    await Promise.all([
      sendReviewNotification(invitation.shopDomain, review),
      sendAppOwnerReviewNotification(invitation.shopDomain, review)
    ]);
  }
  return { review, created, invitation, completed };
}

export async function recordReviewInvitationEmailEvent(event: InvitationEmailEvent) {
  const invitation = await prisma.reviewInvitation.findFirst({
    where: {
      OR: [
        { resendEmailId: event.emailId },
        { reminderResendEmailId: event.emailId }
      ]
    }
  });
  if (!invitation || ["REVIEWED", "CANCELLED", "UNSUBSCRIBED"].includes(invitation.status)) return;

  const data: Record<string, string | Date> = {};
  if (event.type === "email.sent") Object.assign(data, { status: "SENT", sentAt: event.createdAt });
  if (event.type === "email.delivered") Object.assign(data, { status: "DELIVERED", deliveredAt: event.createdAt });
  if (event.type === "email.opened") Object.assign(data, { status: "OPENED", openedAt: event.createdAt });
  if (event.type === "email.clicked") Object.assign(data, { status: "CLICKED", clickedAt: event.createdAt });
  if (event.type === "email.failed") Object.assign(data, { status: "FAILED", skipReason: "Email delivery failed" });
  if (event.type === "email.bounced") Object.assign(data, { status: "BOUNCED", skipReason: "Email bounced" });
  if (event.type === "email.complained") Object.assign(data, { status: "COMPLAINED", skipReason: "Recipient marked email as spam" });
  if (event.type === "email.suppressed") Object.assign(data, { status: "SUPPRESSED", skipReason: "Email provider suppressed this recipient" });
  const statusProgress: Record<string, number> = {
    SCHEDULING: 0,
    SCHEDULED: 1,
    SENT: 2,
    DELIVERED: 3,
    OPENED: 4,
    CLICKED: 5,
    IN_PROGRESS: 6,
    REVIEWED: 7
  };
  const nextStatus = typeof data.status === "string" ? data.status : "";
  const isFailure = ["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"].includes(nextStatus);
  if (nextStatus && !isFailure && (statusProgress[nextStatus] || 0) < (statusProgress[invitation.status] || 0)) {
    delete data.status;
  }
  if (Object.keys(data).length) {
    await prisma.reviewInvitation.update({ where: { id: invitation.id }, data });
  }

  if (["email.bounced", "email.complained", "email.suppressed"].includes(event.type)) {
    await prisma.reviewInvitationSuppression.upsert({
      where: {
        shopDomain_customerEmail: {
          shopDomain: invitation.shopDomain,
          customerEmail: invitation.customerEmail
        }
      },
      update: { reason: event.type },
      create: {
        shopDomain: invitation.shopDomain,
        customerEmail: invitation.customerEmail,
        reason: event.type
      }
    });
    if (invitation.reminderResendEmailId && invitation.reminderResendEmailId !== event.emailId) {
      await cancelScheduledEmail(invitation.reminderResendEmailId);
    }
  }
}

export function reviewInvitationToken(invitationId: string) {
  return `${invitationId}.${invitationSignature(invitationId)}`;
}

function verifiedInvitationId(token: string) {
  const [invitationId, suppliedSignature, ...extra] = token.split(".");
  if (!invitationId || !suppliedSignature || extra.length) {
    throw new Response("Invalid review invitation.", { status: 404 });
  }
  const expected = Buffer.from(invitationSignature(invitationId));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Response("Invalid review invitation.", { status: 404 });
  }
  return invitationId;
}

function invitationSignature(invitationId: string) {
  const secret = String(process.env.REVIEW_INVITATION_SECRET || process.env.SHOPIFY_API_SECRET || "").trim();
  if (!secret) throw new Error("REVIEW_INVITATION_SECRET or SHOPIFY_API_SECRET is required.");
  return createHmac("sha256", secret).update(invitationId).digest("base64url");
}

function invitationPublicUrl(token: string) {
  return `${appUrl()}/review-invitation/${encodeURIComponent(token)}`;
}

function invitationUnsubscribeUrl(token: string) {
  return `${appUrl()}/review-invitation/${encodeURIComponent(token)}/unsubscribe`;
}

function appUrl() {
  return String(process.env.SHOPIFY_APP_URL || "https://app.furniturebrandreviews.com").replace(/\/$/u, "");
}

function merchantReplyTo(shop: {
  contactEmail: string | null;
  storeEmail: string | null;
  notificationEmail: string | null;
}) {
  return [shop.contactEmail, shop.storeEmail, shop.notificationEmail]
    .map(normalizeEmail)
    .find(isEmail) || undefined;
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfUtcMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value) || minimum)));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}
