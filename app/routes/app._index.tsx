import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useFetcher, useLoaderData } from "@remix-run/react";
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
import prisma from "~/db.server";
import { PRO_PLAN, PRO_PLAN_PRICE } from "~/models/billing-plans";
import { normalizeLegacyReviewStatuses } from "~/models/reviews.server";
import { authenticate, isBillingTestMode, isFreeProShop } from "~/shopify.server";

type PlanSource = "FREE" | "BILLING" | "FREE_PARTNER";

type DashboardData = {
  totalReviews: number;
  pendingReviews: number;
  approvedReviews: number;
  brandWidgetStatus: string;
  plan: "FREE" | "PRO";
  planSource: PlanSource;
  subscriptionId: string;
};

const fallbackData: DashboardData = {
  totalReviews: 0,
  pendingReviews: 0,
  approvedReviews: 0,
  brandWidgetStatus: "Active",
  plan: "FREE",
  planSource: "FREE",
  subscriptionId: ""
};

export const loader = async ({ request }: LoaderFunctionArgs): Promise<DashboardData> => {
  try {
    const { billing, session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    await normalizeLegacyReviewStatuses(shopDomain);
    const { totalReviews, pendingReviews, approvedReviews } = await getDashboardReviewStats(shopDomain);
    const billingStatus = isFreeProShop(shopDomain)
      ? { plan: "PRO" as const, planSource: "FREE_PARTNER" as const, subscriptionId: "" }
      : await getBillingStatus(billing);

    await prisma.subscriptionSettings.upsert({
      where: { shopDomain },
      update: { plan: billingStatus.plan },
      create: { shopDomain, plan: billingStatus.plan }
    }).catch((error) => console.error("Failed to sync subscription status", error));

    return {
      totalReviews,
      pendingReviews,
      approvedReviews,
      brandWidgetStatus: "Active",
      plan: billingStatus.plan,
      planSource: billingStatus.planSource,
      subscriptionId: billingStatus.subscriptionId
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
  let stats = await countReviewsForShopDomains(candidateDomains);

  if (stats.totalReviews === 0) {
    const publishedDomains = await prisma.productReview.findMany({
      distinct: ["shopDomain"],
      where: { status: "PUBLISHED" },
      select: { shopDomain: true }
    });
    const fallbackDomains = publishedDomains.map((row) => row.shopDomain);
    if (fallbackDomains.length) {
      stats = await countReviewsForShopDomains(fallbackDomains);
    }
  }

  return stats;
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
  const [totalReviews, pendingReviews, approvedReviews] = await Promise.all([
    prisma.productReview.count({ where: { shopDomain: { in: shopDomains } } }),
    prisma.productReview.count({ where: { shopDomain: { in: shopDomains }, status: "PENDING" } }),
    prisma.productReview.count({ where: { shopDomain: { in: shopDomains }, status: "PUBLISHED" } })
  ]);

  return { totalReviews, pendingReviews, approvedReviews };
}

function normalizeShopDomain(shopDomain: string) {
  return shopDomain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .trim();
}

async function getBillingStatus(billing: any) {
  const checks = await Promise.allSettled([
    billing.check({ plans: [PRO_PLAN], isTest: false }),
    billing.check({ plans: [PRO_PLAN], isTest: true })
  ]);

  for (const check of checks) {
    if (check.status === "fulfilled" && check.value.hasActivePayment) {
      return {
        plan: "PRO" as const,
        planSource: "BILLING" as const,
        subscriptionId: check.value.appSubscriptions[0]?.id || ""
      };
    }
  }

  return {
    plan: "FREE" as const,
    planSource: "FREE" as const,
    subscriptionId: ""
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const appOrigin = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;

  if (isFreeProShop(session.shop)) {
    await prisma.subscriptionSettings.upsert({
      where: { shopDomain: session.shop },
      update: { plan: "PRO" },
      create: { shopDomain: session.shop, plan: "PRO" }
    });

    return { ok: true, plan: "PRO", planSource: "FREE_PARTNER" };
  }

  if (intent === "upgrade") {
    await billing.require({
      plans: [PRO_PLAN],
      isTest: isBillingTestMode(),
      onFailure: async () => billing.request({
        plan: PRO_PLAN,
        isTest: isBillingTestMode(),
        returnUrl: `${appOrigin}/app`
      })
    });

    await prisma.subscriptionSettings.upsert({
      where: { shopDomain: session.shop },
      update: { plan: "PRO" },
      create: { shopDomain: session.shop, plan: "PRO" }
    });

    return { ok: true, plan: "PRO", planSource: "BILLING" };
  }

  if (intent === "cancel") {
    let subscriptionId = String(form.get("subscriptionId") || "");
    if (!subscriptionId) {
      subscriptionId = (await getBillingStatus(billing)).subscriptionId;
    }
    if (subscriptionId) {
      await billing.cancel({
        subscriptionId,
        isTest: isBillingTestMode(),
        prorate: true
      });
    }

    await prisma.subscriptionSettings.upsert({
      where: { shopDomain: session.shop },
      update: { plan: "FREE" },
      create: { shopDomain: session.shop, plan: "FREE" }
    });

    return { ok: true, plan: "FREE", planSource: "FREE" };
  }

  return { ok: false, plan: "FREE", planSource: "FREE", error: "Unsupported billing action." };
};

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [billingOpen, setBillingOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [showReviewBanner, setShowReviewBanner] = React.useState(false);
  const currentPlan: "FREE" | "PRO" = fetcher.data?.plan === "PRO" ? "PRO" : fetcher.data?.plan === "FREE" ? "FREE" : data.plan;
  const currentPlanSource: PlanSource =
    fetcher.data?.planSource === "FREE_PARTNER" || fetcher.data?.planSource === "BILLING" || fetcher.data?.planSource === "FREE"
      ? fetcher.data.planSource
      : data.planSource;
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
          <InlineGrid columns={{ xs: 1, md: 4 }} gap="400">
            <MetricCard title="Total Product Reviews" value={data.totalReviews} />
            <MetricCard title="Pending Reviews" value={data.pendingReviews} tone="critical" />
            <MetricCard title="Approved Reviews" value={data.approvedReviews} />
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
                      <Button tone="critical" onClick={() => setCancelOpen(true)}>End your subscription</Button>
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
          <Text as="p">Your Pro subscription is active and managed through Shopify app billing.</Text>
        </Modal.Section>
      </Modal>
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Are you sure you want to cancel?"
        primaryAction={{
          content: "Downgrade to Free plan",
          destructive: true,
          onAction: () => {
            fetcher.submit({ intent: "cancel", subscriptionId: data.subscriptionId }, { method: "post" });
            setCancelOpen(false);
          }
        }}
        secondaryActions={[{ content: "Continue with Pro plan", onAction: () => setCancelOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">After canceling, you will lose access to:</Text>
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

const planRows = [
  ["Product reviews", true, true],
  ["Review widget", true, true],
  ["Star rating badge", true, true],
  ["Brand trust widgets", false, true],
  ["Photo reviews", false, true],
  ["Review replies", true, true],
  ["Questions & Answers", false, true],
  ["Google and SEO", false, true],
  ["AI review summary", false, true],
  ["Carousel layout", false, true],
  ["Priority support", false, true]
] as const;

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
              <td style={planCellStyle}><PlanMark enabled={free} /></td>
              <td style={planCellStyle}><PlanMark enabled={advanced} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanMark({ enabled }: { enabled: boolean }) {
  return (
    <Text as="span" tone={enabled ? "success" : "subdued"} variant="headingMd">
      {enabled ? "+" : "-"}
    </Text>
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
