import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import * as React from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Link,
  Modal,
  Page,
  Text,
  TextField
} from "@shopify/polaris";
import prisma from "~/db.server";
import { syncAdminEntitlements } from "~/models/entitlements.server";
import { sendTestNotificationEmail, syncShopContactFromShopify } from "~/models/notifications.server";
import { getProductReviewWidgetSettings } from "~/models/reviews.server";
import { authenticate } from "~/shopify.server";

type BrandTrustWidget = {
  key: "brandCarousel" | "brandMicro";
  title: string;
  description: string;
  image: string;
  layout: "carousel" | "micro";
};

type ManualInstallWidget = {
  title: string;
  code: string;
  kind: "productReview" | "starRating" | "brandTrust";
};

const productReviewWidgets = [
  {
    key: "reviewWidget",
    title: "Review Widget",
    description: "Collect and display product reviews on your product pages.",
    image: "/widget-previews/review-widget.jpg",
    customizeUrl: "/app/widgets/review-widget"
  },
  {
    key: "starRating",
    title: "Star Rating Badge",
    description: "Show the average rating of your products and how many reviews they've received.",
    image: "/widget-previews/star-rating-badge.jpg",
    customizeUrl: "/app/widgets/star-rating-badge"
  }
];

const brandTrustWidgets: BrandTrustWidget[] = [
  {
    key: "brandCarousel",
    title: "Brand Review Carousel",
    description: "Display your FurnitureBrandReviews brand reviews in a trust-building carousel.",
    image: "/widget-previews/brand-review-carousel.jpg",
    layout: "carousel"
  },
  {
    key: "brandMicro",
    title: "Brand Micro Trust Badge",
    description: "Show a compact brand rating badge anywhere on your store.",
    image: "/widget-previews/brand-micro-trust-badge.jpg",
    layout: "micro"
  }
];

const defaultBrandProfile = {
  brandName: "",
  brandSlug: "",
  brandProfileUrl: ""
};

const WHATSAPP_SUPPORT_URL = "https://wa.me/447521530350";
const CLAIM_PROFILE_URL = "https://www.furniturebrandreviews.com/claim-your-profile";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const entitlements = await syncAdminEntitlements(shopDomain, billing);
  let widgetSettings = {
    brandName: defaultBrandProfile.brandName,
    brandSlug: defaultBrandProfile.brandSlug,
    profileUrl: defaultBrandProfile.brandProfileUrl
  };
  let googleSeoSettings = {
    reviewsSiteEnabled: false,
    seoRichSnippetsEnabled: false,
    googleShoppingEnabled: false
  };
  let shop = {
    notificationEmail: "",
    storeEmail: "",
    contactEmail: "",
    reviewEmailNotificationsEnabled: true,
    questionEmailNotificationsEnabled: true
  };
  try {
    const [, loadedWidgetSettings, loadedGoogleSeoSettings, loadedShop] = await Promise.all([
      getProductReviewWidgetSettings(shopDomain),
      prisma.widgetSettings.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } }),
      prisma.googleSeoSettings.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } }),
      prisma.shop.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } })
    ]);
    const shouldSyncShopContact = Boolean(
      session.accessToken &&
      !loadedShop.storeEmail &&
      !loadedShop.contactEmail &&
      !loadedShop.shopOwnerEmail
    );
    const resolvedShop = shouldSyncShopContact
      ? await syncShopContactFromShopify(shopDomain, session.accessToken as string) || loadedShop
      : loadedShop;
    widgetSettings = loadedWidgetSettings;
    googleSeoSettings = loadedGoogleSeoSettings;
    shop = {
      notificationEmail: resolvedShop.notificationEmail || "",
      storeEmail: resolvedShop.storeEmail || "",
      contactEmail: resolvedShop.contactEmail || "",
      reviewEmailNotificationsEnabled: resolvedShop.reviewEmailNotificationsEnabled,
      questionEmailNotificationsEnabled: resolvedShop.questionEmailNotificationsEnabled
    };
  } catch (error) {
    console.error("Widgets Settings loader failed; rendering fallback UI", error);
  }

  const productThemeEditorUrl = `https://${session.shop}/admin/themes/current/editor?template=product`;
  const homeThemeEditorUrl = `https://${session.shop}/admin/themes/current/editor?template=index`;
  const productLiquidUrl = `https://${session.shop}/admin/themes/current?key=templates/product.liquid`;
  const appUrl = (process.env.SHOPIFY_APP_URL || "https://app.furniturebrandreviews.com").replace(/\/$/, "");
  const brandSlug = widgetSettings.brandSlug || brandSlugFromProfileUrl(widgetSettings.profileUrl) || "";
  const brandProfileUrl = widgetSettings.profileUrl?.includes("/review/") ? widgetSettings.profileUrl : "";
  const googleSeoInstalled =
    googleSeoSettings.reviewsSiteEnabled &&
    googleSeoSettings.seoRichSnippetsEnabled &&
    googleSeoSettings.googleShoppingEnabled;

  return {
    entitlements,
    googleSeoInstalled,
    productThemeEditorUrl,
    homeThemeEditorUrl,
    productLiquidUrl,
    brandProfile: {
      brandName: widgetSettings.brandName || "",
      brandSlug,
      brandProfileUrl
    },
    notificationSettings: {
      notificationEmail: shop.notificationEmail || shop.storeEmail || shop.contactEmail || "",
      reviewEmailNotificationsEnabled: shop.reviewEmailNotificationsEnabled,
      questionEmailNotificationsEnabled: shop.questionEmailNotificationsEnabled
    },
    brandProfileExists: true,
    appUrl
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const entitlements = await syncAdminEntitlements(session.shop, billing);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "saveNotificationSettings" || intent === "sendTestEmail") {
    const notificationEmail = String(form.get("notificationEmail") || "").trim();
    const reviewEmailNotificationsEnabled = form.get("reviewEmailNotificationsEnabled") === "on";
    const questionEmailNotificationsEnabled = form.get("questionEmailNotificationsEnabled") === "on";

    await prisma.shop.upsert({
      where: { shopDomain: session.shop },
      update: {
        notificationEmail,
        reviewEmailNotificationsEnabled,
        questionEmailNotificationsEnabled
      },
      create: {
        shopDomain: session.shop,
        notificationEmail,
        reviewEmailNotificationsEnabled,
        questionEmailNotificationsEnabled
      }
    });

    if (intent === "sendTestEmail") {
      try {
        const result = await sendTestNotificationEmail(session.shop);
        return { ok: true, id: result.id, error: "", message: "Test email sent.", brandProfile: null };
      } catch (error) {
        console.error("Failed to send test notification email", error);
        return {
          ok: false,
          id: "",
          error: error instanceof Error ? error.message : "Test email failed.",
          message: "",
          brandProfile: null
        };
      }
    }

    return { ok: true, id: "", error: "", message: "Notification settings saved.", brandProfile: null };
  }

  if (intent !== "saveBrandProfile") {
    return { ok: false, id: "", error: "Unsupported action.", message: "", brandProfile: null };
  }

  if (!entitlements.isPro) {
    return { ok: false, id: "", error: "Brand Trust Widgets require the Pro plan.", message: "", brandProfile: null };
  }

  const brandName = String(form.get("brandName") || "").trim();
  if (!brandName) {
    return { ok: false, id: "", error: "Enter your brand name before installing this widget.", message: "", brandProfile: null };
  }

  const brandSlug = slugifyBrandName(brandName);
  const profileUrl = `https://www.furniturebrandreviews.com/review/${brandSlug}`;
  const settings = await prisma.widgetSettings.upsert({
    where: { shopDomain: session.shop },
    update: { brandName, brandSlug, profileUrl },
    create: { shopDomain: session.shop, brandName, brandSlug, profileUrl }
  });
  await prisma.brandWidgetData.upsert({
    where: { shopDomain: session.shop },
    update: { brandName, profileUrl },
    create: { shopDomain: session.shop, brandName, profileUrl }
  });

  return {
    ok: true,
    id: "",
    error: "",
    message: "Brand name saved.",
    brandProfile: {
      brandName: settings.brandName,
      brandSlug: settings.brandSlug,
      brandProfileUrl: settings.profileUrl
    }
  };
};

export default function WidgetsSettings() {
  const { entitlements, googleSeoInstalled, productThemeEditorUrl, homeThemeEditorUrl, productLiquidUrl, brandProfile, notificationSettings, appUrl } = useLoaderData<typeof loader>();
  const brandFetcher = useFetcher<typeof action>();
  const notificationFetcher = useFetcher<typeof action>();
  const [manualWidget, setManualWidget] = React.useState<ManualInstallWidget | null>(null);
  const [brandName, setBrandName] = React.useState(brandProfile.brandName);
  const [notificationEmail, setNotificationEmail] = React.useState(notificationSettings.notificationEmail);
  const [reviewEmailNotificationsEnabled, setReviewEmailNotificationsEnabled] = React.useState(notificationSettings.reviewEmailNotificationsEnabled);
  const [questionEmailNotificationsEnabled, setQuestionEmailNotificationsEnabled] = React.useState(notificationSettings.questionEmailNotificationsEnabled);
  const savedBrandProfile = brandFetcher.data?.ok && brandFetcher.data.brandProfile
    ? brandFetcher.data.brandProfile
    : brandProfile;
  const brandSlug = savedBrandProfile.brandSlug;

  return (
    <Page
      fullWidth
      title="Widgets Settings"
      subtitle="Manage storefront widgets through Theme App Extension blocks."
    >
      <BlockStack gap="500">
        <WidgetSection title="Product Review Widgets">
          {productReviewWidgets.map((widget) => {
            return (
              <WidgetCard key={widget.title} title={widget.title} description={widget.description} image={widget.image}>
                <ButtonGroup>
                  <Button url={productThemeEditorUrl} target="_blank">Install</Button>
                  <Button onClick={() => setManualWidget({
                    title: widget.title,
                    code: buildProductManualInstallCode(appUrl, widget.key),
                    kind: widget.key === "starRating" ? "starRating" : "productReview"
                  })}>
                    Manual install
                  </Button>
                  <Button url={widget.customizeUrl} variant="primary">Customize</Button>
                </ButtonGroup>
              </WidgetCard>
            );
          })}
        </WidgetSection>

        <WidgetSection title="Brand Trust Widgets">
          {!entitlements.isPro ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <Banner title="Brand Trust Widgets are a Pro feature" tone="info" action={{ content: "Upgrade to Pro", url: "/app" }}>
                <Text as="p">Upgrade to connect a business profile and install the Brand Review Carousel or Brand Micro Trust Badge.</Text>
              </Banner>
            </div>
          ) : null}
          <div style={{ alignSelf: "start" }}>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
                    <Text as="h3" variant="headingMd">FurnitureBrandReviews business profile</Text>
                    {!entitlements.isPro ? <Badge>Pro</Badge> : brandSlug ? <Badge tone="success">Profile connected</Badge> : <Badge tone="attention">Profile required</Badge>}
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    Connect your business profile before installing a brand widget so your reviews can load correctly.
                  </Text>
                  <div>
                    <Button url={CLAIM_PROFILE_URL} target="_blank" disabled={!entitlements.isPro}>Claim your business profile</Button>
                  </div>
                </BlockStack>

                <Box background="bg-surface-secondary" borderRadius="200" padding="300">
                  <BlockStack gap="300">
                    <Text as="h4" variant="headingSm">Business profile</Text>
                    <brandFetcher.Form method="post">
                      <BlockStack gap="300">
                        <input type="hidden" name="intent" value="saveBrandProfile" />
                        <TextField
                          label="Brand name"
                          name="brandName"
                          value={brandName}
                          onChange={setBrandName}
                          autoComplete="organization"
                          placeholder="Enter your brand name"
                          disabled={!entitlements.isPro}
                        />
                        <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
                          <Text as="p" tone="subdued">
                            {brandSlug ? `Brand slug: ${brandSlug}` : "Save a brand name to create its slug."}
                          </Text>
                          <Button submit variant="primary" loading={brandFetcher.state !== "idle"} disabled={!entitlements.isPro}>Save brand name</Button>
                        </InlineStack>
                        {brandFetcher.data?.ok ? <Badge tone="success">Brand name saved</Badge> : null}
                        {brandFetcher.data && !brandFetcher.data.ok ? <Text as="p" tone="critical">{brandFetcher.data.error}</Text> : null}
                      </BlockStack>
                    </brandFetcher.Form>
                  </BlockStack>
                </Box>

                <Box background="bg-surface-secondary" borderRadius="200" padding="300">
                  <BlockStack gap="300">
                    <Text as="h4" variant="headingSm">Email notifications</Text>
                    <notificationFetcher.Form method="post">
                      <BlockStack gap="300">
                        <input type="hidden" name="intent" value="saveNotificationSettings" />
                        <TextField
                          label="Notification email"
                          name="notificationEmail"
                          type="email"
                          value={notificationEmail}
                          onChange={setNotificationEmail}
                          autoComplete="email"
                          placeholder="merchant@example.com"
                          helpText="Receive email notifications when customers submit a new review or question."
                        />
                        <Checkbox
                          label="Email me when a new review is submitted"
                          name="reviewEmailNotificationsEnabled"
                          checked={reviewEmailNotificationsEnabled}
                          onChange={setReviewEmailNotificationsEnabled}
                        />
                        <Checkbox
                          label="Email me when a new question is submitted"
                          name="questionEmailNotificationsEnabled"
                          checked={questionEmailNotificationsEnabled}
                          onChange={setQuestionEmailNotificationsEnabled}
                        />
                        <InlineStack gap="300" wrap>
                          <Button submit loading={notificationFetcher.state !== "idle"}>Save notification settings</Button>
                          <Button
                            loading={notificationFetcher.state !== "idle"}
                            onClick={() => {
                              notificationFetcher.submit(
                                {
                                  intent: "sendTestEmail",
                                  notificationEmail,
                                  reviewEmailNotificationsEnabled: reviewEmailNotificationsEnabled ? "on" : "",
                                  questionEmailNotificationsEnabled: questionEmailNotificationsEnabled ? "on" : ""
                                },
                                { method: "post" }
                              );
                            }}
                          >
                            Send test email
                          </Button>
                        </InlineStack>
                        {notificationFetcher.data?.message ? <Badge tone="success">{notificationFetcher.data.message}</Badge> : null}
                        {notificationFetcher.data?.error ? <Text as="p" tone="critical">{notificationFetcher.data.error}</Text> : null}
                      </BlockStack>
                    </notificationFetcher.Form>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </div>
          {brandTrustWidgets.map((widget) => {
            const canInstall = Boolean(brandSlug) && entitlements.isPro;
            return (
            <WidgetCard
              key={widget.title}
              title={widget.title}
              description={widget.description}
              image={widget.image}
              instructions={<BrandWidgetInstallInstructions />}
            >
              {!canInstall ? <Text as="p" tone="critical">Enter your brand name before installing this widget.</Text> : null}
              <ButtonGroup>
                <Button url={homeThemeEditorUrl} target="_blank" disabled={!canInstall}>Install</Button>
                <Button
                  onClick={() => setManualWidget({
                    title: widget.title,
                    code: buildBrandManualInstallCode(widget.layout, brandSlug),
                    kind: "brandTrust"
                  })}
                  disabled={!canInstall}
                >
                  Manual install
                </Button>
              </ButtonGroup>
            </WidgetCard>
            );
          })}
        </WidgetSection>

        <WidgetSection title="Google and SEO">
          <WidgetCard
            title="Google and SEO"
            description="Manage review visibility settings for Google search, rich snippets, and shopping feeds."
            image="/widget-previews/google-and-seo.jpg"
          >
            <Badge tone={entitlements.isPro && googleSeoInstalled ? "success" : "attention"}>
              {!entitlements.isPro ? "Pro" : googleSeoInstalled ? "Installed" : "Settings only"}
            </Badge>
            <Button url={entitlements.isPro ? "/app/google-seo" : "/app"} variant="primary">
              {entitlements.isPro ? "Manage" : "Upgrade to Pro"}
            </Button>
          </WidgetCard>
        </WidgetSection>

        <ManualInstallModal
          widget={manualWidget}
          productLiquidUrl={productLiquidUrl}
          onClose={() => setManualWidget(null)}
        />
      </BlockStack>
    </Page>
  );
}

function WidgetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <BlockStack gap="300">
      <Text as="h2" variant="headingLg">{title}</Text>
      <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="500">
        {children}
      </InlineGrid>
    </BlockStack>
  );
}

function WidgetCard({
  title,
  description,
  image,
  instructions,
  children
}: {
  title: string;
  description: string;
  image: string;
  instructions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card padding="0">
      <BlockStack gap="0">
        <img
          src={image}
          alt=""
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "16 / 10",
            objectFit: "cover",
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8
          }}
        />
        <Box padding="400">
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="start" gap="300" wrap={false}>
              <Text as="h3" variant="headingMd">{title}</Text>
            </InlineStack>
            <Text as="p" tone="subdued">{description}</Text>
            {instructions || <Text as="p" tone="subdued">Instruction: click Add section → Add app → choose the one you want.</Text>}
            <BlockStack gap="300">{children}</BlockStack>
          </BlockStack>
        </Box>
      </BlockStack>
    </Card>
  );
}

function BrandWidgetInstallInstructions() {
  return (
    <BlockStack gap="100">
      <Text as="p" tone="subdued">
        <strong>Online Store 2.0 / JSON theme:</strong> click <strong>Install</strong>, then go to <strong>Add section → Apps</strong> and choose this widget.
      </Text>
      <Text as="p" tone="subdued">
        <strong>Legacy Liquid theme:</strong> click <strong>Install</strong>, then go to <strong>Add section → Sections</strong> and choose this widget. If it is not listed, click <strong>Manual install</strong> and add the code to a <strong>Custom Liquid/HTML</strong> section or theme file.
      </Text>
    </BlockStack>
  );
}

function ManualInstallModal({
  widget,
  productLiquidUrl,
  onClose
}: {
  widget: ManualInstallWidget | null;
  productLiquidUrl: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const code = widget?.code || "";
  const isProductWidget = widget?.kind === "productReview" || widget?.kind === "starRating";

  React.useEffect(() => {
    if (!widget) setCopied(false);
  }, [widget]);

  return (
    <Modal
      open={Boolean(widget)}
      onClose={onClose}
      title={widget ? `Manual install: ${widget.title}` : "Manual install"}
      primaryAction={{
        content: copied ? "Copied" : "Copy code",
        onAction: async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
        }
      }}
      secondaryActions={[{ content: "Close", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {isProductWidget ? (
            <BlockStack gap="300">
              <Text as="p" variant="headingSm">Add the widget code</Text>
              <Box as="div" paddingInlineStart="400">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>
                    Open{" "}
                    <Link url={productLiquidUrl} target="_blank">
                      templates/product.liquid
                    </Link>
                    .
                  </li>
                  <li>
                    Under <strong>{`{% section 'product-template' %}`}</strong>, add the following code:
                  </li>
                </ul>
              </Box>
              <Text as="p" tone="subdued">
                If your theme does not have <strong>templates/product.liquid</strong>, paste the code in <strong>sections/main-product.liquid</strong> or a Custom Liquid block where you want the widget to appear.
              </Text>
            </BlockStack>
          ) : (
            <BlockStack gap="300">
              <Text as="p" variant="headingSm">Add the widget code</Text>
              <Text as="p" tone="subdued">
                Paste this code into a Custom Liquid section, page, blog post, footer, or theme file where you want the FurnitureBrandReviews brand trust widget to appear.
              </Text>
              <Box as="div" paddingInlineStart="400">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Open the page, section, or theme file where you want the widget.</li>
                  <li>Paste the code in that position.</li>
                  <li>Click <strong>Save</strong>, then refresh the storefront.</li>
                </ul>
              </Box>
            </BlockStack>
          )}
          <Box background="bg-surface-secondary" borderRadius="200" padding="300">
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <code>{code}</code>
            </pre>
          </Box>
          <Box as="div" paddingInlineStart="400">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Click <strong>Save</strong>.</li>
            </ul>
          </Box>
          {isProductWidget ? (
            <Text as="p" tone="subdued">
              Manual code renders directly where it is pasted. It will not show as a Theme Editor app block.
            </Text>
          ) : null}
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <Text as="p" tone="subdued">
              Need help installing this widget?
            </Text>
            <Button url={WHATSAPP_SUPPORT_URL} target="_blank">
              Need help?
            </Button>
          </InlineStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function brandSlugFromProfileUrl(profileUrl: string | null) {
  if (!profileUrl) return "";

  try {
    const url = new URL(profileUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const reviewIndex = parts.indexOf("review");
    return reviewIndex >= 0 ? parts[reviewIndex + 1] || "" : parts.at(-1) || "";
  } catch {
    return "";
  }
}

function slugifyBrandName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildProductManualInstallCode(appUrl: string, widgetKey: string) {
  const dataAttribute = widgetKey === "starRating" ? "data-fbr-product-stars" : "data-fbr-product-reviews";
  const label = widgetKey === "starRating" ? "Product Star Rating" : "Product Reviews Widget";
  return `<!-- Start Furniture Brand Reviews ${label} code -->
<link rel="stylesheet" href="${appUrl}/fbr-widgets.css">
<script src="${appUrl}/fbr-widgets.js" defer></script>
<div
  class="fbr-widget"
  ${dataAttribute}
  data-api-base="/apps/fbr"
  data-shop="{{ shop.permanent_domain }}"
  data-product-id="{{ product.id }}"
  data-product-handle="{{ product.handle }}"
  data-product-title="{{ product.title | escape }}"
></div>
<!-- End Furniture Brand Reviews ${label} code -->`;
}

function buildBrandManualInstallCode(layout: BrandTrustWidget["layout"], brandSlug: string) {
  return `<div class="fbr-widget" data-brand="${brandSlug}" data-layout="${layout}"></div>
<script async src="https://www.furniturebrandreviews.com/widget.js"></script>`;
}
