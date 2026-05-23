import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { syncShopContactFromShopify } from "./models/notifications.server";

const appUrl = process.env.SHOPIFY_CLI_TUNNEL_URL || process.env.SHOPIFY_APP_URL || "";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true
  },
  hooks: {
    afterAuth: async ({ session }) => {
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
        prisma.brandWidgetData.upsert({
          where: { shopDomain: session.shop },
          update: {},
          create: { shopDomain: session.shop }
        })
      ]);
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
