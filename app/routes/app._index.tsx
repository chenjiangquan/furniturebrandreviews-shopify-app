import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import * as React from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Modal,
  Page,
  Text
} from "@shopify/polaris";
import { CheckIcon, XIcon } from "@shopify/polaris-icons";
import prisma from "~/db.server";
import { syncAdminEntitlements } from "~/models/entitlements.server";
import { PRO_PLAN_PRICE } from "~/models/billing-plans";
import { authenticate, isFreeProShop } from "~/shopify.server";

type PlanSource = "FREE" | "BILLING" | "FREE_PARTNER";

type DashboardData = {
  totalReviews: number;
  brandWidgetStatus: string;
  plan: "FREE" | "PRO";
  planSource: PlanSource;
  subscriptionId: string;
};

const fallbackData: DashboardData = {
  totalReviews: 0,
  brandWidgetStatus: "Active",
  plan: "FREE",
  planSource: "FREE",
  subscriptionId: ""
};

export const loader = async ({ request }: LoaderFunctionArgs): Promise<DashboardData> => {
  try {
    const { billing, session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const { totalReviews } = await getDashboardReviewStats(shopDomain);
    const billingStatus = await syncAdminEntitlements(shopDomain, billing);

    return {
      totalReviews,
      brandWidgetStatus: "Active",
      plan: billingStatus.plan,
      planSource: billingStatus.planSource,
      subscriptionId: ""
    };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    if (!(error instanceof Response)) {
      console.error("Dashboard loader failed", error);
    }

    return fallbackData;
  }
};

async function getDashboardReviewStats(shopDomain: string) {
  const candidateDomains = await dashboardReviewShopDomains(shopDomain);
  return countReviewsForShopDomains(candidateDomains);
}

async function dashboardReviewShopDomains(shopDomain: string) {
  const normalizedShop = normalizeShopDomain(shopDomain);
  const reviewDomains = await prisma.productReview.findMany({
    distinct: ["shopDomain"],
    select: { shopDomain: true }
  });
  const sessionDomains = await prisma.session.findMany({
    distinct: ["shop"],
    select: { shop: true }
  });
  const candidates = new Set<string>([shopDomain]);

  for (const row of [...reviewDomains, ...sessionDomains.map((session) => ({ shopDomain: session.shop }))]) {
    if (normalizeShopDomain(row.shopDomain) === normalizedShop) {
      candidates.add(row.shopDomain);
    }
  }

  return [...candidates];
}

async function countReviewsForShopDomains(shopDomains: string[]) {
  const totalReviews = await prisma.productReview.count({ where: { shopDomain: { in: shopDomains } } });
  return { totalReviews };
}

function normalizeShopDomain(shopDomain: string) {
  return shopDomain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .trim();
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { redirect, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (isFreeProShop(session.shop)) {
    await prisma.subscriptionSettings.upsert({
      where: { shopDomain: session.shop },
      update: { plan: "PRO" },
      create: { shopDomain: session.shop, plan: "PRO" }
    });

    return { ok: true, plan: "PRO", planSource: "FREE_PARTNER" };
  }

  if (intent === "upgrade" || intent === "manage") {
    const planSelectionUrl = buildShopifyPlanSelectionUrl(session.shop);
    console.log("[billing] Redirecting to Shopify App Pricing plan selection", {
      shop: session.shop,
      planSelectionUrl
    });

    return redirect(planSelectionUrl, { target: "_top" });
  }

  return { ok: false, plan: "FREE", planSource: "FREE", error: "Unsupported billing action." };
};

function buildShopifyPlanSelectionUrl(shopDomain: string) {
  const storeHandle = shopDomain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(".myshopify.com", "")
    .replace(/\/.*$/, "")
    .trim();
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "furniture-brand-reviews";

  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const [billingOpen, setBillingOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [showReviewBanner, setShowReviewBanner] = React.useState(false);
  const currentPlan = data.plan;
  const currentPlanSource = data.planSource;
  const hasFreePartnerAccess = currentPlanSource === "FREE_PARTNER";

  React.useEffect(() => {
    const dismissedUntil = Number(window.localStorage.getItem("fbr-app-review-dismissed-until") || 0);
    setShowReviewBanner(!dismissedUntil || dismissedUntil < Date.now());
  }, []);

  const dismissReviewBanner = React.useCallback(() => {
    window.localStorage.setItem("fbr-app-review-dismissed-until", String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setShowReviewBanner(false);
  }, []);

  const openAppReviewPage = React.useCallback(() => {
    window.open("https://apps.shopify.com/furniture-brand-reviews#reviews", "_blank", "noopener,noreferrer");
  }, []);

  return (
    <Page fullWidth>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <img
                src="/branding/fbr-logo.png"
                alt="Furniture Brand Reviews"
                style={{
                  display: "block",
                  height: 42,
                  maxWidth: "min(320px, 70vw)",
                  objectFit: "contain",
                  objectPosition: "left center"
                }}
              />
              {showReviewBanner ? (
                <Box background="bg-fill-info" borderRadius="300" padding="400">
                  <InlineStack align="space-between" blockAlign="center" gap="400">
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingMd">How's your experience with Furniture Brand Reviews?</Text>
                      <Text as="p">
                        Rate us by clicking on the stars.{" "}
                        <button
                          type="button"
                          onClick={dismissReviewBanner}
                          style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                        >
                          Dismiss
                        </button>
                      </Text>
                    </BlockStack>
                    <InlineStack gap="100" wrap={false}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          aria-label={`Review Furniture Brand Reviews with ${star} star${star === 1 ? "" : "s"}`}
                          onClick={openAppReviewPage}
                          style={{ background: "transparent", border: 0, color: "#ffffff", cursor: "pointer", fontSize: 28, lineHeight: 1, padding: 0 }}
                        >
                          ☆
                        </button>
                      ))}
                    </InlineStack>
                  </InlineStack>
                </Box>
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <MetricCard title="Total Product Reviews" value={data.totalReviews} />
            <Card>
              <BlockStack gap="200">
                <Text as="p" tone="subdued">Brand Widget Status</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="success">{data.brandWidgetStatus}</Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <InlineStack align="space-between" blockAlign="start" gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingLg">
                    You're on the {currentPlan === "PRO" ? "Pro" : "Free"} plan
                  </Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="p" tone="subdued">Pro plan: {PRO_PLAN_PRICE}, 14-day trial, cancel anytime.</Text>
                    {hasFreePartnerAccess ? <Badge tone="info">Free partner access</Badge> : null}
                  </InlineStack>
                  {hasFreePartnerAccess ? (
                    <Text as="p" tone="subdued">This shop is on your free Pro shop whitelist, so Shopify billing is not required.</Text>
                  ) : null}
                </BlockStack>
                <Badge tone={currentPlan === "PRO" ? "success" : "attention"}>{currentPlan === "PRO" ? "Pro" : "Free"}</Badge>
              </InlineStack>

              <PlanComparisonTable currentPlan={currentPlan} />

              <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                {[
                  "Get reviews faster",
                  "Build your brand",
                  "Grow store visits",
                  "Increase sales",
                  "Unlimited essentials",
                  "Fair value: $9.99 per month, cancel anytime"
                ].map((benefit) => (
                  <Text key={benefit} as="p">- {benefit}</Text>
                ))}
              </InlineGrid>
              <InlineStack gap="300">
                {currentPlan === "PRO" ? (
                  hasFreePartnerAccess ? (
                    <Text as="p" tone="subdued">No subscription action is needed for this whitelisted shop.</Text>
                  ) : (
                    <>
                      <Button variant="primary" onClick={() => setBillingOpen(true)}>Manage subscription</Button>
                      <Button tone="critical" onClick={() => setCancelOpen(true)}>Change or cancel subscription</Button>
                    </>
                  )
                ) : (
                  <Form method="post">
                    <input type="hidden" name="intent" value="upgrade" />
                    <Button variant="primary" submit>
                      Upgrade your subscription
                    </Button>
                  </Form>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Furniture Brand Reviews Dashboard</Text>
              <Text as="p" tone="subdued">
                Manage product reviews, brand trust widgets, and storefront display settings.
              </Text>
              <InlineStack gap="400">
                <Link to="/app/product-reviews">Product Reviews</Link>
                <Link to="/app/widgets-settings">Widgets Settings</Link>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
      <Modal
        open={billingOpen}
        onClose={() => setBillingOpen(false)}
        title="Manage subscription"
        primaryAction={{ content: "Close", onAction: () => setBillingOpen(false) }}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">Your subscription is managed by Shopify App Pricing.</Text>
            <Form method="post">
              <input type="hidden" name="intent" value="manage" />
              <Button variant="primary" submit>Open Shopify plan selection</Button>
            </Form>
          </BlockStack>
        </Modal.Section>
      </Modal>
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Change or cancel subscription"
        primaryAction={{
          content: "Open Shopify plan selection",
          onAction: () => document.getElementById("fbr-manage-plan-submit")?.click()
        }}
        secondaryActions={[{ content: "Keep current plan", onAction: () => setCancelOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">Shopify will show the available Free and Pro plans for this app. If you switch to Free, you will lose access to:</Text>
            <BlockStack gap="100">
              {[
                "Review carousel",
                "Pro widgets",
                "Google and SEO settings",
                "AI summary",
                "Questions and Answers",
                "Email customizations",
                "Social/Google integrations"
              ].map((item) => <Text key={item} as="p">- {item}</Text>)}
            </BlockStack>
            <Form method="post">
              <input type="hidden" name="intent" value="manage" />
              <button id="fbr-manage-plan-submit" type="submit" style={{ display: "none" }} />
            </Form>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

function MetricCard({
  title,
  value,
  tone
}: {
  title: string;
  value: string | number;
  tone?: "critical" | "subdued";
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="p" tone="subdued">{title}</Text>
        <Text as="p" variant="heading2xl" tone={tone}>{value}</Text>
      </BlockStack>
    </Card>
  );
}

type PlanCellValue = boolean | string;

const planRows: ReadonlyArray<readonly [string, PlanCellValue, PlanCellValue]> = [
  ["Product reviews", true, true],
  ["Review widget", true, true],
  ["Star rating badge", true, true],
  ["Brand trust widgets", false, true],
  ["Photo reviews", true, true],
  ["Review replies", true, true],
  ["Questions & Answers", true, true],
  ["Google and SEO", false, true],
  ["AI review summary", false, true],
  ["Cards, carousel & sidebar layouts", false, true],
  ["Priority support", false, true],
  ["Import Review", "30 reviews/month", true],
  ["Delete Review", "5 reviews/month", true]
];

function PlanComparisonTable({ currentPlan }: { currentPlan: "FREE" | "PRO" }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", minWidth: 620, tableLayout: "fixed", width: "100%" }}>
        <colgroup>
          <col style={{ width: "33.333%" }} />
          <col style={{ width: "33.333%" }} />
          <col style={{ width: "33.333%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={planHeaderStyle}>Plans</th>
            <th style={planHeaderStyle}>
              <InlineStack gap="200" blockAlign="center" wrap>
                <span>Free</span>
                {currentPlan === "FREE" ? <Badge tone="success">Current plan</Badge> : null}
              </InlineStack>
            </th>
            <th style={planHeaderStyle}>
              <InlineStack gap="200" blockAlign="center" wrap>
                <span>Pro</span>
                <Text as="span" tone="subdued">{PRO_PLAN_PRICE}</Text>
                {currentPlan === "PRO" ? <Badge tone="success">Current plan</Badge> : null}
              </InlineStack>
            </th>
          </tr>
        </thead>
        <tbody>
          {planRows.map(([feature, free, advanced]) => (
            <tr key={feature}>
              <td style={planCellStyle}>{feature}</td>
              <td style={planCellStyle}><PlanCell value={free} /></td>
              <td style={planCellStyle}><PlanCell value={advanced} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanCell({ value }: { value: PlanCellValue }) {
  return typeof value === "boolean"
    ? <PlanMark enabled={value} />
    : <Text as="span">{value}</Text>;
}

function PlanMark({ enabled }: { enabled: boolean }) {
  const Icon = enabled ? CheckIcon : XIcon;
  return (
    <span
      aria-label={enabled ? "Included" : "Not included"}
      title={enabled ? "Included" : "Not included"}
      style={{
        alignItems: "center",
        background: enabled ? "#d1fae5" : "#f3f4f6",
        borderRadius: 999,
        color: enabled ? "#047857" : "#6b7280",
        display: "inline-flex",
        height: 28,
        justifyContent: "center",
        width: 28
      }}
    >
      <Icon aria-hidden="true" style={{ height: 18, width: 18 }} />
    </span>
  );
}

const planHeaderStyle: React.CSSProperties = {
  borderBottom: "1px solid #dfe3e8",
  padding: "12px 10px",
  textAlign: "left",
  verticalAlign: "middle"
};

const planCellStyle: React.CSSProperties = {
  borderBottom: "1px solid #f1f2f3",
  padding: "12px 10px",
  textAlign: "left",
  verticalAlign: "middle",
  width: "33.333%"
};
