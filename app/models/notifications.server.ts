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
      html: reviewEmailTemplate(shop, review)
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
      subject: "New customer question received",
      html: questionEmailTemplate(shop, question)
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
    html: baseEmailTemplate({
      eyebrow: "Test notification",
      heading: "Your email notifications are ready",
      intro: "This is a test email from Furniture Brand Reviews.",
      content: `
        ${infoRows([
          ["Store", shop.storeName || shop.shopDomain],
          ["Shop domain", shop.shopDomain],
          ["Notification email", to]
        ])}
      `,
      shopDomain: shop.shopDomain
    })
  });
  return result;
}

export async function sendAppInstallOwnerNotification(shopDomain: string, event: "install" | "reinstall" = "install") {
  try {
    const to = String(process.env.APP_OWNER_NOTIFICATION_EMAIL || "").trim();
    if (!to) {
      console.log("[email] APP_OWNER_NOTIFICATION_EMAIL is not configured; skipping owner install notification.");
      return;
    }

    const shop = await getShopForNotification(shopDomain);
    const eventLabel = event === "reinstall" ? "Shopify app reinstalled" : "New Shopify app install";
    console.log("[email] sending app install notification to", to);

    await sendEmail({
      to,
      subject: `${eventLabel}: ${shop.shopDomain}`,
      html: baseEmailTemplate({
        eyebrow: eventLabel,
        heading: `${eventLabel} received`,
        intro: "A merchant installed Furniture Brand Reviews on their Shopify store.",
        shopDomain: shop.shopDomain,
        ctaUrl: adminAppUrl(shop.shopDomain),
        ctaLabel: "Open Shopify app",
        content: `
          ${infoRows([
            ["Store", shop.storeName || shop.shopDomain],
            ["Shop domain", shop.shopDomain],
            ["Store email", shop.storeEmail || shop.contactEmail || shop.shopOwnerEmail || "Not available"],
            ["Notification email", shop.notificationEmail || "Not configured"],
            ["Event", eventLabel],
            ["Installed at", formatEmailDate(new Date())]
          ])}
        `
      })
    });
  } catch (error) {
    console.error("Failed to send app install owner notification email", error);
  }
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

function adminAppUrl(shopDomain: string) {
  const shopHandle = shopDomain.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${shopHandle}/apps/furniture-brand-reviews`;
}

function reviewEmailTemplate(shop: Shop, review: ProductReview) {
  return baseEmailTemplate({
    eyebrow: "New product review",
    heading: "New product review received",
    intro: "A customer submitted a new product review for your store.",
    shopDomain: shop.shopDomain,
    content: `
      <div style="background:#f8faf9;border:1px solid #dde5e1;border-radius:14px;padding:18px;margin:18px 0;">
        <div style="font-size:13px;line-height:20px;color:#667085;margin-bottom:6px;">Rating</div>
        <div style="font-size:22px;line-height:28px;color:#f5a623;font-weight:700;letter-spacing:1px;">${ratingStars(review.rating)} <span style="font-size:14px;color:#344054;font-weight:600;">${review.rating}/5</span></div>
        <h2 style="font-size:20px;line-height:28px;color:#101828;margin:14px 0 8px;">${escapeHtml(review.title)}</h2>
        <p style="font-size:15px;line-height:24px;color:#344054;margin:0;">${escapeHtml(review.content)}</p>
      </div>
      ${infoRows([
        ["Product", review.productTitle || review.productHandle || review.productId],
        ["Customer", review.customerName],
        ["Email", review.customerEmail || "Not provided"],
        ["Date", formatEmailDate(review.createdAt)],
        ["Store", shop.storeName || shop.shopDomain],
        ["Shop domain", shop.shopDomain]
      ])}
    `
  });
}

function questionEmailTemplate(shop: Shop, question: ProductQuestion) {
  return baseEmailTemplate({
    eyebrow: "New customer question",
    heading: "New customer question received",
    intro: "A customer submitted a new product question for your store.",
    shopDomain: shop.shopDomain,
    content: `
      <div style="background:#f8faf9;border:1px solid #dde5e1;border-radius:14px;padding:18px;margin:18px 0;">
        <div style="font-size:13px;line-height:20px;color:#667085;margin-bottom:6px;">Question</div>
        <p style="font-size:16px;line-height:25px;color:#101828;margin:0;font-weight:600;">${escapeHtml(question.question)}</p>
      </div>
      ${infoRows([
        ["Product", question.productTitle || question.productHandle || question.productId],
        ["Customer", question.customerName],
        ["Email", question.customerEmail || "Not provided"],
        ["Date", formatEmailDate(question.createdAt)],
        ["Store", shop.storeName || shop.shopDomain],
        ["Shop domain", shop.shopDomain]
      ])}
    `
  });
}

function baseEmailTemplate(input: {
  eyebrow: string;
  heading: string;
  intro: string;
  content: string;
  shopDomain: string;
  ctaUrl?: string;
  ctaLabel?: string;
}) {
  const adminUrl = input.ctaUrl || adminProductReviewsUrl(input.shopDomain);
  const ctaLabel = input.ctaLabel || "Open Product Reviews";
  return `
    <div style="margin:0;padding:0;background:#f3f5f6;">
      <div style="display:none;max-height:0;overflow:hidden;color:#f3f5f6;">${escapeHtml(input.heading)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f5f6;border-collapse:collapse;margin:0;padding:0;">
        <tr>
          <td align="center" style="padding:28px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;border-collapse:collapse;">
              <tr>
                <td style="padding:0 0 14px;">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;font-weight:800;color:#1f2937;">
                    Furniture <span style="color:#6b4eff;">Brand Reviews</span>
                  </div>
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#667085;">Real reviews. Real furniture.</div>
                </td>
              </tr>
              <tr>
                <td style="background:#ffffff;border:1px solid #e1e6ea;border-radius:18px;padding:28px;box-shadow:0 8px 24px rgba(16,24,40,0.06);font-family:Arial,Helvetica,sans-serif;">
                  <div style="font-size:12px;line-height:18px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#1f6f64;margin-bottom:8px;">${escapeHtml(input.eyebrow)}</div>
                  <h1 style="font-size:26px;line-height:34px;color:#101828;margin:0 0 10px;font-weight:800;">${escapeHtml(input.heading)}</h1>
                  <p style="font-size:15px;line-height:24px;color:#475467;margin:0 0 18px;">${escapeHtml(input.intro)}</p>
                  ${input.content}
                  <div style="margin-top:24px;">
                    <a href="${adminUrl}" style="display:inline-block;background:#1f6f64;color:#ffffff;text-decoration:none;font-size:15px;line-height:20px;font-weight:700;padding:12px 18px;border-radius:10px;">${escapeHtml(ctaLabel)}</a>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 4px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;color:#667085;">
                  FurnitureBrandReviews.com · Manage notification settings in your Shopify app
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function infoRows(rows: Array<[string, string]>) {
  return `
    <div style="border-top:1px solid #edf0f2;margin-top:18px;padding-top:6px;">
      ${rows.map(([label, value]) => `
        <div style="display:block;border-bottom:1px solid #edf0f2;padding:11px 0;">
          <div style="font-size:12px;line-height:18px;color:#667085;font-weight:700;text-transform:uppercase;letter-spacing:.03em;">${escapeHtml(label)}</div>
          <div style="font-size:15px;line-height:23px;color:#101828;font-weight:600;word-break:break-word;">${escapeHtml(value)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function ratingStars(rating: number) {
  const full = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${"★".repeat(full)}${"☆".repeat(5 - full)}`;
}

function formatEmailDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
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
