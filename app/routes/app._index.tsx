import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
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
import { normalizeLegacyReviewStatuses } from "~/models/reviews.server";
import { authenticate } from "~/shopify.server";

type DashboardData = {
  totalReviews: number;
  pendingReviews: number;
  approvedReviews: number;
  brandWidgetStatus: string;
  plan: "FREE" | "ADVANCED";
};

const fallbackData: DashboardData = {
  totalReviews: 0,
  pendingReviews: 0,
  approvedReviews: 0,
  brandWidgetStatus: "Active",
  plan: "FREE"
};

export const loader = async ({ request }: LoaderFunctionArgs): Promise<DashboardData> => {
  try {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    await normalizeLegacyReviewStatuses(shopDomain);
    const { totalReviews, pendingReviews, approvedReviews } = await getDashboardReviewStats(shopDomain);
    const subscription = await prisma.subscriptionSettings.upsert({
      where: { shopDomain },
      update: {},
      create: { shopDomain }
    }).catch(() => ({ plan: "FREE" }));

    return {
      totalReviews,
      pendingReviews,
      approvedReviews,
      brandWidgetStatus: "Active",
      plan: subscription.plan === "ADVANCED" ? "ADVANCED" : "FREE"
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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const plan = String(form.get("plan") || "FREE") === "ADVANCED" ? "ADVANCED" : "FREE";

  await prisma.subscriptionSettings.upsert({
    where: { shopDomain: session.shop },
    update: { plan },
    create: { shopDomain: session.shop, plan }
  });

  return { ok: true, plan };
};

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [billingOpen, setBillingOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const currentPlan: "FREE" | "ADVANCED" = fetcher.data?.plan === "ADVANCED" ? "ADVANCED" : data.plan;

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
              <Box background="bg-fill-info" borderRadius="300" padding="400">
                <InlineStack align="space-between" blockAlign="center" gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">How's your experience with Furniture Brand Reviews?</Text>
                    <Text as="p">Rate us by clicking on the stars. <button type="button" style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", padding: 0, textDecoration: "underline" }}>Dismiss</button></Text>
                  </BlockStack>
                  <InlineStack gap="100" wrap={false}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star} style={{ color: "#ffffff", fontSize: 28, lineHeight: 1 }}>☆</span>
                    ))}
                  </InlineStack>
                </InlineStack>
              </Box>
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
                    You're on the {currentPlan === "ADVANCED" ? "Advanced" : "Free"} plan
                  </Text>
                  <Text as="p" tone="subdued">Advanced plan: $9.90 / month, cancel anytime.</Text>
                </BlockStack>
                <Badge tone={currentPlan === "ADVANCED" ? "success" : "attention"}>{currentPlan === "ADVANCED" ? "Advanced" : "Free"}</Badge>
              </InlineStack>

              <PlanComparisonTable currentPlan={currentPlan} />

              <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                {[
                  "Get reviews faster",
                  "Build your brand",
                  "Grow store visits",
                  "Increase sales",
                  "Unlimited essentials",
                  "Fair value: $9.90 per month, cancel anytime"
                ].map((benefit) => (
                  <Text key={benefit} as="p">- {benefit}</Text>
                ))}
              </InlineGrid>
              <InlineStack gap="300">
                {currentPlan === "ADVANCED" ? (
                  <>
                    <Button variant="primary" onClick={() => setBillingOpen(true)}>Manage subscription</Button>
                    <Button tone="critical" onClick={() => setCancelOpen(true)}>End your subscription</Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    loading={fetcher.state !== "idle"}
                    onClick={() => fetcher.submit({ plan: "ADVANCED" }, { method: "post" })}
                  >
                    Upgrade your subscription
                  </Button>
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
          <Text as="p">Billing page will be connected before launch.</Text>
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
            fetcher.submit({ plan: "FREE" }, { method: "post" });
            setCancelOpen(false);
          }
        }}
        secondaryActions={[{ content: "Continue with Advanced plan", onAction: () => setCancelOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">After canceling, you will lose access to:</Text>
            <BlockStack gap="100">
              {[
                "Review carousel",
                "Advanced widgets",
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

function PlanComparisonTable({ currentPlan }: { currentPlan: "FREE" | "ADVANCED" }) {
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
                <span>Advanced</span>
                <Text as="span" tone="subdued">$9.90 / month</Text>
                {currentPlan === "ADVANCED" ? <Badge tone="success">Current plan</Badge> : null}
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
