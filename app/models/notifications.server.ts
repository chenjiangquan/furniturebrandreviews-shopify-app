import type { ProductQuestion, ProductReview, Shop } from "@prisma/client";
import { Resend } from "resend";
import prisma from "~/db.server";

type ShopifyShopPayload = {
  shop?: {
    name?: string;
    email?: string;
    customer_email?: string;
    shop_owner?: string;
    domain?: string;
    myshopify_domain?: string;
  };
};

export async function syncShopContactFromShopify(shopDomain: string, accessToken: string) {
  try {
    const response = await fetch(`https://${shopDomain}/admin/api/2025-10/shop.json`, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      console.error("Unable to fetch Shopify shop contact email", {
        shopDomain,
        status: response.status,
        body: await response.text().catch(() => "")
      });
      return null;
    }

    const payload = await response.json() as ShopifyShopPayload;
    const shop = payload.shop;
    if (!shop) return null;

    const storeEmail = shop.email || "";
    const contactEmail = shop.customer_email || "";
    const notificationEmail = firstEmail(storeEmail, contactEmail);
    const existingShop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { notificationEmail: true }
    });

    return prisma.shop.upsert({
      where: { shopDomain },
      update: {
        storeName: shop.name || "",
        storeEmail,
        contactEmail,
        shopOwnerEmail: shop.shop_owner || "",
        notificationEmail: existingShop?.notificationEmail || notificationEmail || undefined
      },
      create: {
        shopDomain,
        storeName: shop.name || "",
        storeEmail,
        contactEmail,
        shopOwnerEmail: shop.shop_owner || "",
        notificationEmail
      }
    });
  } catch (error) {
    console.error("Unable to sync Shopify shop contact email", error);
    return null;
  }
}

export async function sendReviewNotification(shopDomain: string, review: ProductReview) {
  try {
    const shop = await getShopForNotification(shopDomain);
    if (!shop.reviewEmailNotificationsEnabled) return;
    const to = notificationRecipient(shop);
    if (!to) return;

    await sendEmail({
      to,
      subject: "New product review received",
      html: notificationLayout(`
        <p>A customer submitted a new product review.</p>
        ${detailsTable([
          ["Store", shop.storeName || shop.shopDomain],
          ["Shop domain", shop.shopDomain],
          ["Product", review.productTitle || review.productHandle || review.productId],
          ["Rating", `${review.rating} / 5`],
          ["Review title", review.title],
          ["Review content", review.content],
          ["Customer name", review.customerName],
          ["Customer email", review.customerEmail || "Not provided"],
          ["Submitted date", review.createdAt.toISOString()]
        ])}
        <p><a href="${adminProductReviewsUrl(shop.shopDomain)}">Open Product Reviews</a></p>
      `)
    });
  } catch (error) {
    console.error("Failed to send review notification email", error);
  }
}

export async function sendQuestionNotification(shopDomain: string, question: ProductQuestion) {
  try {
    const shop = await getShopForNotification(shopDomain);
    if (!shop.questionEmailNotificationsEnabled) return;
    const to = notificationRecipient(shop);
    if (!to) return;

    await sendEmail({
      to,
      subject: "New product question received",
      html: notificationLayout(`
        <p>A customer submitted a new product question.</p>
        ${detailsTable([
          ["Store", shop.storeName || shop.shopDomain],
          ["Shop domain", shop.shopDomain],
          ["Product", question.productTitle || question.productHandle || question.productId],
          ["Question", question.question],
          ["Customer name", question.customerName],
          ["Customer email", question.customerEmail || "Not provided"],
          ["Submitted date", question.createdAt.toISOString()]
        ])}
        <p><a href="${adminProductReviewsUrl(shop.shopDomain)}">Open Product Reviews</a></p>
      `)
    });
  } catch (error) {
    console.error("Failed to send question notification email", error);
  }
}

export async function sendTestNotificationEmail(shopDomain: string) {
  const shop = await getShopForNotification(shopDomain);
  const to = notificationRecipient(shop);
  if (!to) throw new Error("Notification email address is missing.");

  console.log("[email] sending test email to", to);
  const result = await sendEmail({
    to,
    subject: "Furniture Brand Reviews test notification",
    html: notificationLayout(`
      <p>This is a test email from Furniture Brand Reviews.</p>
      ${detailsTable([
        ["Store", shop.storeName || shop.shopDomain],
        ["Shop domain", shop.shopDomain],
        ["Notification email", to]
      ])}
    `)
  });
  return result;
}

async function getShopForNotification(shopDomain: string) {
  return prisma.shop.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain }
  });
}

function notificationRecipient(shop: Shop) {
  return firstEmail(shop.notificationEmail, shop.storeEmail, shop.contactEmail, shop.shopOwnerEmail);
}

function firstEmail(...values: Array<string | null | undefined>) {
  return values.map((value) => String(value || "").trim()).find((value) => value.includes("@")) || "";
}

type ResendSendResult = {
  id?: string;
  error?: unknown;
  [key: string]: unknown;
};

async function sendEmail(input: { to: string; subject: string; html: string }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.NOTIFICATION_FROM_EMAIL || "").trim();
  if (!apiKey || !from) {
    const missing = [
      !apiKey ? "RESEND_API_KEY" : "",
      !from ? "NOTIFICATION_FROM_EMAIL" : ""
    ].filter(Boolean).join(", ");
    const error = new Error(`Resend email is not configured. Missing: ${missing}.`);
    console.error("[email] resend error", error.message);
    throw error;
  }

  console.log("[email] from", from);
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html
  });
  console.log("[email] resend result", sanitizeResendLog(result));

  if (result.error) {
    const error = new Error(`Resend failed: ${resendErrorMessage(result)}`);
    console.error("[email] resend error", error.message);
    throw error;
  }

  const id = result.data?.id;
  if (!id) {
    const error = new Error(`Resend did not return an email id: ${resendErrorMessage(result)}`);
    console.error("[email] resend error", error.message);
    throw error;
  }

  return { id };
}

function adminProductReviewsUrl(shopDomain: string) {
  const shopHandle = shopDomain.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${shopHandle}/apps/furniture-brand-reviews/app/product-reviews`;
}

function notificationLayout(content: string) {
  return `
    <div style="font-family: Arial, sans-serif; color: #202223; line-height: 1.5;">
      <h2 style="margin: 0 0 16px;">Furniture Brand Reviews</h2>
      ${content}
    </div>
  `;
}

function detailsTable(rows: Array<[string, string]>) {
  return `
    <table style="border-collapse: collapse; width: 100%; max-width: 680px;">
      <tbody>
        ${rows.map(([label, value]) => `
          <tr>
            <td style="border: 1px solid #dfe3e8; padding: 8px; font-weight: 700; width: 180px;">${escapeHtml(label)}</td>
            <td style="border: 1px solid #dfe3e8; padding: 8px;">${escapeHtml(value)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resendErrorMessage(result: ResendSendResult) {
  if (!result) return "Unknown Resend error.";
  if (typeof result.error === "string") return result.error;
  if (result.error && typeof result.error === "object") {
    const error = result.error as Record<string, unknown>;
    return String(error.message || error.name || JSON.stringify(error));
  }
  return JSON.stringify(result);
}

function sanitizeResendLog(result: ResendSendResult) {
  return {
    id: (result.data as { id?: string } | undefined)?.id || result.id,
    error: result.error
  };
}
