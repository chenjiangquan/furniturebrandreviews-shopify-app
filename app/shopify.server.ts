import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { PRO_PLAN } from "./models/billing-plans";
import { sendAppInstallOwnerNotification, syncShopContactFromShopify } from "./models/notifications.server";

const appUrl = process.env.SHOPIFY_CLI_TUNNEL_URL || process.env.SHOPIFY_APP_URL || "";

export function isBillingTestMode() {
  return process.env.SHOPIFY_BILLING_TEST === "true" || process.env.NODE_ENV !== "production";
}

export function isFreeProShop(shopDomain: string) {
  const normalizedShop = normalizeShopDomainForFreePro(shopDomain);
  if (!normalizedShop) {
    return false;
  }

  return (process.env.FREE_PRO_SHOPS || "")
    .split(",")
    .map((shop) => normalizeShopDomainForFreePro(shop))
    .filter(Boolean)
    .includes(normalizedShop);
}

function normalizeShopDomainForFreePro(shopDomain: string) {
  return shopDomain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .trim();
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [PRO_PLAN]: {
      trialDays: 14,
      lineItems: [
        {
          amount: 9.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days
        }
      ]
    }
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true
  },
  hooks: {
    afterAuth: async ({ session }) => {
      const existingShop = await prisma.shop.findUnique({
        where: { shopDomain: session.shop },
        select: { accessToken: true, isActive: true }
      });
      const installEvent = !existingShop
        ? "install"
        : existingShop.isActive === false || !existingShop.accessToken
          ? "reinstall"
          : null;

      await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        update: {
          accessToken: session.accessToken,
          scope: session.scope,
          isActive: true,
          uninstalledAt: null
        },
        create: {
          shopDomain: session.shop,
          accessToken: session.accessToken,
          scope: session.scope,
          isActive: true
        }
      });

      await Promise.all([
        session.accessToken ? syncShopContactFromShopify(session.shop, session.accessToken) : Promise.resolve(null),
        prisma.widgetSettings.upsert({
          where: { shopDomain: session.shop },
          update: {},
          create: { shopDomain: session.shop }
        }),
        prisma.productReviewSettings.upsert({
          where: { shopDomain: session.shop },
          update: {},
          create: { shopDomain: session.shop }
        }),
        prisma.subscriptionSettings.upsert({
          where: { shopDomain: session.shop },
          update: {},
          create: { shopDomain: session.shop, plan: "FREE" }
        }),
        prisma.brandWidgetData.upsert({
          where: { shopDomain: session.shop },
          update: {},
          create: { shopDomain: session.shop }
        })
      ]);

      if (installEvent) {
        await sendAppInstallOwnerNotification(session.shop, installEvent);
      }
    }
  }
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
