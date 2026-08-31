import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "~/db.server";

const DEVELOPMENT_HCAPTCHA_SITE_KEY = "10000000-ffff-ffff-ffff-000000000001";
const DEVELOPMENT_HCAPTCHA_SECRET_KEY = "0x0000000000000000000000000000000000000000";

type StorefrontReviewPayload = Record<string, unknown>;

type HCaptchaResult = {
  success?: boolean;
  hostname?: string;
  "error-codes"?: string[];
};

export function storefrontReviewCaptchaSiteKey() {
  return process.env.HCAPTCHA_SITE_KEY ||
    (process.env.NODE_ENV === "production" ? "" : DEVELOPMENT_HCAPTCHA_SITE_KEY);
}

export function validateStorefrontReviewPayload(payload: StorefrontReviewPayload) {
  if (String(payload.companyWebsite || "").trim()) {
    throw new Response("Review could not be submitted.", { status: 422 });
  }

  const customerName = boundedText(payload.customerName || payload.name, "Name", 2, 80);
  const customerEmail = boundedText(payload.customerEmail || payload.email, "Email", 3, 254).toLowerCase();
  const title = boundedText(payload.title, "Review title", 3, 120);
  const content = boundedText(payload.content, "Review content", 10, 3000);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(customerEmail)) {
    throw new Response("Enter a valid email address.", { status: 400 });
  }

  const spamScore =
    (looksLikeRandomToken(customerName) ? 1 : 0) +
    (looksLikeRandomToken(title) ? 2 : 0) +
    (looksLikeRandomToken(content) ? 3 : 0);
  if (spamScore >= 4) {
    throw new Response("Review content appears to be automated.", { status: 422 });
  }

  return { customerName, customerEmail, title, content };
}

export async function protectStorefrontReviewSubmission(
  request: Request,
  payload: StorefrontReviewPayload,
  shopDomain: string,
  productId: string,
  customerEmail: string
) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { isActive: true, uninstalledAt: true }
  });
  if (!shop || !shop.isActive || shop.uninstalledAt) {
    throw new Response("This store is not available for review submissions.", { status: 403 });
  }

  const clientIp = clientIpFromRequest(request);
  await verifyHCaptcha(request, payload, clientIp);

  if (clientIp) {
    await consumeRateLimit(
      shopDomain,
      `ip:${hashRateLimitValue(`${shopDomain}\u001f${clientIp}`)}`,
      3,
      10 * 60 * 1000
    );
  }
  await consumeRateLimit(
    shopDomain,
    `email-product:${hashRateLimitValue(`${shopDomain}\u001f${customerEmail}\u001f${productId}`)}`,
    2,
    24 * 60 * 60 * 1000
  );
}

function boundedText(value: unknown, field: string, minimum: number, maximum: number) {
  const text = String(value || "").trim();
  const length = Array.from(text).length;
  if (length < minimum || length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) {
    throw new Response(`${field} must be between ${minimum} and ${maximum} characters.`, { status: 400 });
  }
  return text;
}

function looksLikeRandomToken(value: string) {
  if (!/^[A-Za-z]{12,}$/u.test(value)) return false;

  const characters = [...value];
  const uniqueRatio = new Set(characters.map((character) => character.toLowerCase())).size / characters.length;
  const internalUppercase = (value.slice(1).match(/[A-Z]/g) || []).length;
  const caseTransitions = characters.slice(1).reduce((total, character, index) => {
    const previous = characters[index];
    return total + (/[A-Z]/.test(character) !== /[A-Z]/.test(previous) ? 1 : 0);
  }, 0);
  const vowelRatio = (value.match(/[aeiou]/gi) || []).length / characters.length;

  return uniqueRatio <= 0.2 ||
    (internalUppercase >= 2 && caseTransitions >= 3 && uniqueRatio >= 0.5) ||
    vowelRatio < 0.15 ||
    vowelRatio > 0.75;
}

function clientIpFromRequest(request: Request) {
  return String(
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    ""
  ).trim();
}

function hashRateLimitValue(value: string) {
  const secret = process.env.RATE_LIMIT_HASH_SECRET || process.env.SHOPIFY_API_SECRET || "development-only";
  return createHash("sha256").update(`${secret}\u001f${value}`).digest("hex");
}

async function consumeRateLimit(shopDomain: string, key: string, maximum: number, windowMs: number) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);
  const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>(Prisma.sql`
    INSERT INTO "StorefrontSubmissionRateLimit"
      ("key", "shopDomain", "count", "windowStart", "expiresAt", "updatedAt")
    VALUES
      (${key}, ${shopDomain}, 1, ${now}, ${expiresAt}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "StorefrontSubmissionRateLimit"."expiresAt" <= ${now} THEN 1
        ELSE "StorefrontSubmissionRateLimit"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "StorefrontSubmissionRateLimit"."expiresAt" <= ${now} THEN ${now}
        ELSE "StorefrontSubmissionRateLimit"."windowStart"
      END,
      "expiresAt" = CASE
        WHEN "StorefrontSubmissionRateLimit"."expiresAt" <= ${now} THEN ${expiresAt}
        ELSE "StorefrontSubmissionRateLimit"."expiresAt"
      END,
      "updatedAt" = ${now}
    RETURNING "count", "expiresAt"
  `);

  const rateLimit = rows[0];
  if (rateLimit && rateLimit.count > maximum) {
    const retryAfter = Math.max(1, Math.ceil((new Date(rateLimit.expiresAt).getTime() - Date.now()) / 1000));
    throw new Response("Too many review submissions. Please try again later.", {
      status: 429,
      headers: { "Retry-After": String(retryAfter) }
    });
  }
}

async function verifyHCaptcha(request: Request, payload: StorefrontReviewPayload, remoteIp: string) {
  const siteKey = storefrontReviewCaptchaSiteKey();
  const secretKey = process.env.HCAPTCHA_SECRET_KEY ||
    (process.env.NODE_ENV === "production" ? "" : DEVELOPMENT_HCAPTCHA_SECRET_KEY);
  if (!siteKey || !secretKey) {
    throw new Response("Review verification is temporarily unavailable.", { status: 503 });
  }

  const token = String(payload["h-captcha-response"] || "").trim();
  if (!token) {
    throw new Response("Complete the review verification before submitting.", { status: 400 });
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
    sitekey: siteKey
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  let response: Response;
  try {
    response = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    throw new Response("Review verification is temporarily unavailable.", { status: 503 });
  }

  const result = await response.json() as HCaptchaResult;
  if (!response.ok || !result.success) {
    throw new Response("Review verification failed. Please try again.", { status: 403 });
  }

  const originHostname = hostnameFromOrigin(request.headers.get("origin"));
  if (
    process.env.NODE_ENV === "production" &&
    originHostname &&
    result.hostname &&
    originHostname !== result.hostname.toLowerCase()
  ) {
    throw new Response("Review verification did not match this storefront.", { status: 403 });
  }
}

function hostnameFromOrigin(origin: string | null) {
  if (!origin) return "";
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}
