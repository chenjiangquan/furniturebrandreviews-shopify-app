import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Link as RemixLink, useFetcher, useLoaderData, useNavigate, type ShouldRevalidateFunctionArgs } from "@remix-run/react";
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
import { adminLoaderCacheKey, cachedAdminLoader, invalidateAdminLoaderCache } from "~/models/admin-loader-cache.server";
import { buildShopifyPlanSelectionUrl, getShopEntitlements } from "~/models/entitlements.server";
import { sendTestNotificationEmail, syncShopContactFromShopify } from "~/models/notifications.server";
import { authenticate } from "~/shopify.server";

type BrandTrustWidget = {
  key: "brandCarousel" | "brandMicro";
  title: string;
  description: string;
  image: string;
  layout: "carousel" | "micro";
  blockHandle: string;
  installTarget: string;
};

type ThemeTemplateType = "json" | "liquid" | "unknown";

type ThemeCompatibility = {
  themeName: string;
  product: ThemeTemplateType;
  index: ThemeTemplateType;
};

type ManualInstallWidget = {
  title: string;
  code: string;
  kind: "productReview" | "starRating" | "brandTrust";
  editorUrl?: string;
  compatibilityUnknown?: boolean;
};

const productReviewWidgets = [
  {
    key: "reviewWidget",
    title: "Review Widget",
    description: "Collect and display product reviews on your product pages.",
    image: "/widget-previews/review-widget.jpg",
    customizeUrl: "/app/widgets/review-widget",
    blockHandle: "product-reviews-widget",
    installTarget: "newAppsSection"
  },
  {
    key: "starRating",
    title: "Star Rating Badge",
    description: "Show the average rating of your products and how many reviews they've received.",
    image: "/widget-previews/star-rating-badge.jpg",
    customizeUrl: "/app/widgets/star-rating-badge",
    blockHandle: "product-star-rating",
    installTarget: "mainSection"
  }
];

const brandTrustWidgets: BrandTrustWidget[] = [
  {
    key: "brandCarousel",
    title: "Brand Review Carousel",
    description: "Display your FurnitureBrandReviews brand reviews in a trust-building carousel.",
    image: "/widget-previews/brand-review-carousel.jpg",
    layout: "carousel",
    blockHandle: "fbr-brand-review-carousel",
    installTarget: "newAppsSection"
  },
  {
    key: "brandMicro",
    title: "Brand Micro Trust Badge",
    description: "Show a compact brand rating badge anywhere on your store.",
    image: "/widget-previews/brand-micro-trust-badge.jpg",
    layout: "micro",
    blockHandle: "fbr-brand-micro-trust-badge",
    installTarget: "newAppsSection"
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
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const themeCompatibilityPromise = cachedAdminLoader(
    adminLoaderCacheKey(shopDomain, "theme-compatibility"),
    () => detectThemeCompatibility(admin),
    5 * 60_000
  ).catch((error) => {
    console.warn("Unable to detect published theme compatibility", {
      shopDomain,
      error: error instanceof Error ? error.message : String(error)
    });
    return { themeName: "Published theme", product: "unknown", index: "unknown" } as ThemeCompatibility;
  });
  let entitlements: Awaited<ReturnType<typeof getShopEntitlements>>;
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
    const [loadedWidgetSettings, loadedGoogleSeoSettings, loadedShop, loadedEntitlements] = await cachedAdminLoader(
      adminLoaderCacheKey(shopDomain, "widgets-settings"),
      () => Promise.all([
        prisma.widgetSettings.findUnique({ where: { shopDomain } }),
        prisma.googleSeoSettings.findUnique({ where: { shopDomain } }),
        prisma.shop.findUnique({ where: { shopDomain } }),
        getShopEntitlements(shopDomain)
      ])
    );
    entitlements = loadedEntitlements;
    const shouldSyncShopContact = Boolean(
      loadedShop &&
      session.accessToken &&
      !loadedShop.storeEmail &&
      !loadedShop.contactEmail &&
      !loadedShop.shopOwnerEmail
    );
    const resolvedShop = loadedShop && shouldSyncShopContact
      ? await syncShopContactFromShopify(shopDomain, session.accessToken as string) || loadedShop
      : loadedShop;
    if (loadedWidgetSettings) widgetSettings = loadedWidgetSettings;
    if (loadedGoogleSeoSettings) googleSeoSettings = loadedGoogleSeoSettings;
    if (resolvedShop) {
      shop = {
        notificationEmail: resolvedShop.notificationEmail || "",
        storeEmail: resolvedShop.storeEmail || "",
        contactEmail: resolvedShop.contactEmail || "",
        reviewEmailNotificationsEnabled: resolvedShop.reviewEmailNotificationsEnabled,
        questionEmailNotificationsEnabled: resolvedShop.questionEmailNotificationsEnabled
      };
    }
  } catch (error) {
    console.error("Widgets Settings loader failed; rendering fallback UI", error);
    entitlements = await getShopEntitlements(shopDomain);
  }

  const shopifyApiKey = process.env.SHOPIFY_API_KEY || "db5beafee602d16825792984fa641886";
  const productWidgetInstallUrls = Object.fromEntries(
    productReviewWidgets.map((widget) => [
      widget.key,
      buildThemeAppBlockInstallUrl({
        shopDomain: session.shop,
        apiKey: shopifyApiKey,
        template: "product",
        blockHandle: widget.blockHandle,
        target: widget.installTarget
      })
    ])
  );
  const brandWidgetInstallUrls = Object.fromEntries(
    brandTrustWidgets.map((widget) => [
      widget.key,
      buildThemeAppBlockInstallUrl({
        shopDomain: session.shop,
        apiKey: shopifyApiKey,
        template: "index",
        blockHandle: widget.blockHandle,
        target: widget.installTarget
      })
    ])
  );
  const productLiquidUrl = `https://${session.shop}/admin/themes/current?key=templates/product.liquid`;
  const appUrl = (process.env.SHOPIFY_APP_URL || "https://app.furniturebrandreviews.com").replace(/\/$/, "");
  const brandSlug = widgetSettings.brandSlug || brandSlugFromProfileUrl(widgetSettings.profileUrl) || "";
  const brandProfileUrl = widgetSettings.profileUrl?.includes("/review/") ? widgetSettings.profileUrl : "";
  const googleSeoInstalled =
    googleSeoSettings.reviewsSiteEnabled &&
    googleSeoSettings.seoRichSnippetsEnabled &&
    googleSeoSettings.googleShoppingEnabled;
  const themeCompatibility = await themeCompatibilityPromise;

  return {
    entitlements,
    googleSeoInstalled,
    themeCompatibility,
    productWidgetInstallUrls,
    brandWidgetInstallUrls,
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
    upgradeUrl: buildShopifyPlanSelectionUrl(shopDomain),
    appUrl
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  invalidateAdminLoaderCache(session.shop);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "saveNotificationSettings" || intent === "sendTestEmail") {
    const notificationEmail = String(form.get("notificationEmail") || "").trim();
    const reviewEmailNotificationsEnabled = booleanFromForm(form, "reviewEmailNotificationsEnabled");
    const questionEmailNotificationsEnabled = booleanFromForm(form, "questionEmailNotificationsEnabled");

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

    return {
      ok: true,
      id: "",
      error: "",
      message: "Notification settings saved.",
      brandProfile: null,
      notificationSettings: {
        notificationEmail,
        reviewEmailNotificationsEnabled,
        questionEmailNotificationsEnabled
      }
    };
  }

  if (intent !== "saveBrandProfile") {
    return { ok: false, id: "", error: "Unsupported action.", message: "", brandProfile: null };
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
  const { entitlements, googleSeoInstalled, themeCompatibility, productWidgetInstallUrls, brandWidgetInstallUrls, productLiquidUrl, brandProfile, notificationSettings, upgradeUrl, appUrl } = useLoaderData<typeof loader>();
  const brandFetcher = useFetcher<typeof action>();
  const notificationFetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const [manualWidget, setManualWidget] = React.useState<ManualInstallWidget | null>(null);
  const [brandName, setBrandName] = React.useState(brandProfile.brandName);
  const [notificationEmail, setNotificationEmail] = React.useState(notificationSettings.notificationEmail);
  const [reviewEmailNotificationsEnabled, setReviewEmailNotificationsEnabled] = React.useState(notificationSettings.reviewEmailNotificationsEnabled);
  const [questionEmailNotificationsEnabled, setQuestionEmailNotificationsEnabled] = React.useState(notificationSettings.questionEmailNotificationsEnabled);
  const savedBrandProfile = brandFetcher.data?.ok && brandFetcher.data.brandProfile
    ? brandFetcher.data.brandProfile
    : brandProfile;
  const brandSlug = savedBrandProfile.brandSlug;

  React.useEffect(() => {
    const saved = notificationFetcher.data && "notificationSettings" in notificationFetcher.data
      ? notificationFetcher.data.notificationSettings
      : null;
    if (!saved) return;
    setNotificationEmail(saved.notificationEmail);
    setReviewEmailNotificationsEnabled(saved.reviewEmailNotificationsEnabled);
    setQuestionEmailNotificationsEnabled(saved.questionEmailNotificationsEnabled);
  }, [notificationFetcher.data]);

  return (
    <Page
      fullWidth
      title="Widgets Settings"
      subtitle="Manage storefront widgets through Theme App Extension blocks."
    >
      <RemixLink to="/app/widgets/review-widget" prefetch="render" aria-hidden tabIndex={-1} style={{ display: "none" }} />
      <RemixLink to="/app/widgets/star-rating-badge" prefetch="render" aria-hidden tabIndex={-1} style={{ display: "none" }} />
      {entitlements.isPro ? <RemixLink to="/app/google-seo" prefetch="render" aria-hidden tabIndex={-1} style={{ display: "none" }} /> : null}
      <BlockStack gap="500">
        <WidgetSection title="Product Review Widgets">
          {themeCompatibility.product !== "json" ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <LegacyThemeBanner themeName={themeCompatibility.themeName} template="product" detectedType={themeCompatibility.product} />
            </div>
          ) : null}
          {productReviewWidgets.map((widget) => {
            const openManualInstall = () => setManualWidget({
              title: widget.title,
              code: buildProductManualInstallCode(appUrl, widget.key),
              kind: widget.key === "starRating" ? "starRating" : "productReview"
            });
            const openUnknownInstall = () => setManualWidget({
              title: widget.title,
              code: buildProductManualInstallCode(appUrl, widget.key),
              kind: widget.key === "starRating" ? "starRating" : "productReview",
              editorUrl: productWidgetInstallUrls[widget.key],
              compatibilityUnknown: true
            });
            return (
              <WidgetCard key={widget.title} title={widget.title} description={widget.description} image={widget.image}>
                <ButtonGroup>
                  {themeCompatibility.product === "json" ? (
                    <Button url={productWidgetInstallUrls[widget.key]} target="_blank">Install</Button>
                  ) : themeCompatibility.product === "unknown" ? (
                    <Button onClick={openUnknownInstall}>Install</Button>
                  ) : (
                    <Button onClick={openManualInstall}>Install</Button>
                  )}
                  <Button onClick={openManualInstall}>
                    Manual install
                  </Button>
                  <Button onClick={() => navigate(widget.customizeUrl)} variant="primary">Customize</Button>
                </ButtonGroup>
              </WidgetCard>
            );
          })}
        </WidgetSection>

        <WidgetSection title="Brand Trust Widgets">
          {themeCompatibility.index !== "json" ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <LegacyThemeBanner themeName={themeCompatibility.themeName} template="index" detectedType={themeCompatibility.index} />
            </div>
          ) : null}
          {!entitlements.isPro ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <Banner title="Brand Trust Widgets are a Pro feature" tone="info" action={{ content: "Upgrade to Pro", onAction: () => openTopLevel(upgradeUrl) }}>
                <Text as="p">Business profile setup is included on Free. Upgrade to install the Brand Review Carousel or Brand Micro Trust Badge.</Text>
              </Banner>
            </div>
          ) : null}
          <div style={{ alignSelf: "start" }}>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
                    <Text as="h3" variant="headingMd">FurnitureBrandReviews business profile</Text>
                    {brandSlug ? <Badge tone="success">Profile connected</Badge> : <Badge tone="attention">Profile not connected</Badge>}
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    Connect your business profile before installing a brand widget so your reviews can load correctly.
                  </Text>
                  <div>
                    <Button url={CLAIM_PROFILE_URL} target="_blank">Claim your business profile</Button>
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
                        />
                        <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
                          <Text as="p" tone="subdued">
                            {brandSlug ? `Brand slug: ${brandSlug}` : "Save a brand name to create its slug."}
                          </Text>
                          <Button submit variant="primary" loading={brandFetcher.state !== "idle"}>Save brand name</Button>
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
                          checked={reviewEmailNotificationsEnabled}
                          onChange={setReviewEmailNotificationsEnabled}
                        />
                        <input
                          type="hidden"
                          name="reviewEmailNotificationsEnabled"
                          value={reviewEmailNotificationsEnabled ? "true" : "false"}
                        />
                        <Checkbox
                          label="Email me when a new question is submitted"
                          checked={questionEmailNotificationsEnabled}
                          onChange={setQuestionEmailNotificationsEnabled}
                        />
                        <input
                          type="hidden"
                          name="questionEmailNotificationsEnabled"
                          value={questionEmailNotificationsEnabled ? "true" : "false"}
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
            const openManualInstall = () => setManualWidget({
              title: widget.title,
              code: buildBrandManualInstallCode(widget.layout, brandSlug),
              kind: "brandTrust"
            });
            const openUnknownInstall = () => setManualWidget({
              title: widget.title,
              code: buildBrandManualInstallCode(widget.layout, brandSlug),
              kind: "brandTrust",
              editorUrl: brandWidgetInstallUrls[widget.key],
              compatibilityUnknown: true
            });
            return (
            <WidgetCard
              key={widget.title}
              title={widget.title}
              description={widget.description}
              image={widget.image}
              instructions={<BrandWidgetInstallInstructions templateType={themeCompatibility.index} />}
            >
              {!canInstall ? <Text as="p" tone="critical">Enter your brand name before installing this widget.</Text> : null}
              <ButtonGroup>
                {themeCompatibility.index === "json" ? (
                  <Button url={brandWidgetInstallUrls[widget.key]} target="_blank" disabled={!canInstall}>Install</Button>
                ) : themeCompatibility.index === "unknown" ? (
                  <Button onClick={openUnknownInstall} disabled={!canInstall}>Install</Button>
                ) : (
                  <Button onClick={openManualInstall} disabled={!canInstall}>Install</Button>
                )}
                <Button
                  onClick={openManualInstall}
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
            <Button onClick={() => entitlements.isPro ? navigate("/app/google-seo") : openTopLevel(upgradeUrl)} variant="primary">
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

export const shouldRevalidate = ({ formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) =>
  formMethod ? false : defaultShouldRevalidate;

function openTopLevel(url: string) {
  window.open(url, "_top");
}

function booleanFromForm(form: FormData, name: string) {
  const value = form.get(name);
  if (value === null) return false;
  return ["on", "true", "1", "yes"].includes(String(value).toLowerCase());
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

function BrandWidgetInstallInstructions({ templateType }: { templateType: ThemeTemplateType }) {
  return (
    <BlockStack gap="100">
      {templateType === "json" ? (
        <Text as="p" tone="subdued">
          <strong>Online Store 2.0 / JSON theme:</strong> click <strong>Install</strong> to preview this widget in a new Apps section, then choose its position and save.
        </Text>
      ) : templateType === "unknown" ? (
        <Text as="p" tone="subdued">
          <strong>Theme type not confirmed:</strong> click <strong>Install</strong> to try the Theme Editor. If the widget is unavailable there, use the manual code instead.
        </Text>
      ) : (
        <Text as="p" tone="subdued">
          <strong>Legacy Liquid theme:</strong> Shopify does not list app blocks or app sections in this theme. Click <strong>Install</strong> to open the manual code and paste it into a Custom Liquid/HTML section or theme file.
        </Text>
      )}
    </BlockStack>
  );
}

function LegacyThemeBanner({
  themeName,
  template,
  detectedType
}: {
  themeName: string;
  template: "product" | "index";
  detectedType: ThemeTemplateType;
}) {
  const templateFilename = `templates/${template}.${detectedType === "liquid" ? "liquid" : "json"}`;
  return (
    <Banner title={detectedType === "liquid" ? "Legacy Liquid theme detected" : "Theme compatibility could not be confirmed"} tone="info">
      <Text as="p">
        {detectedType === "liquid"
          ? `${themeName} uses ${templateFilename}. Shopify app blocks are unavailable on this template, so Install will open the manual installation code.`
          : "The published theme template could not be checked. Install will let you try the Theme Editor and also provides a manual fallback."}
      </Text>
    </Banner>
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
      title={widget ? `${widget.compatibilityUnknown ? "Install options" : "Manual install"}: ${widget.title}` : "Manual install"}
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
          {widget?.compatibilityUnknown && widget.editorUrl ? (
            <Banner title="Try the Theme Editor first" tone="info">
              <BlockStack gap="300">
                <Text as="p">
                  This store may support the app block even though its theme type could not be confirmed. Open the Theme Editor and add the widget there. If Shopify says the template does not support app blocks, use the manual code below.
                </Text>
                <InlineStack align="start">
                  <Button url={widget.editorUrl} target="_blank" variant="primary">Open Theme Editor</Button>
                </InlineStack>
              </BlockStack>
            </Banner>
          ) : null}
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

function buildThemeAppBlockInstallUrl({
  shopDomain,
  apiKey,
  template,
  blockHandle,
  target
}: {
  shopDomain: string;
  apiKey: string;
  template: string;
  blockHandle: string;
  target: string;
}) {
  const params = new URLSearchParams({
    template,
    addAppBlockId: `${apiKey}/${blockHandle}`,
    target
  });
  return `https://${shopDomain}/admin/themes/current/editor?${params.toString()}`;
}

async function detectThemeCompatibility(admin: {
  graphql: (query: string) => Promise<Response>;
}): Promise<ThemeCompatibility> {
  const response = await admin.graphql(`#graphql
    query PublishedThemeCompatibility {
      themes(first: 5, roles: [MAIN]) {
        nodes {
          name
          productJson: files(first: 1, filenames: ["templates/product.json"]) {
            nodes { filename }
          }
          productLiquid: files(first: 1, filenames: ["templates/product.liquid"]) {
            nodes { filename }
          }
          indexJson: files(first: 1, filenames: ["templates/index.json"]) {
            nodes { filename }
          }
          indexLiquid: files(first: 1, filenames: ["templates/index.liquid"]) {
            nodes { filename }
          }
        }
      }
    }
  `);
  if (!response.ok) throw new Error(`Shopify theme query failed (${response.status})`);

  const payload = await response.json() as {
    data?: {
      themes?: {
        nodes?: Array<{
          name?: string;
          productJson?: { nodes?: Array<{ filename?: string }> } | null;
          productLiquid?: { nodes?: Array<{ filename?: string }> } | null;
          indexJson?: { nodes?: Array<{ filename?: string }> } | null;
          indexLiquid?: { nodes?: Array<{ filename?: string }> } | null;
        }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message || "Shopify theme query failed").join("; "));
  }

  const theme = payload.data?.themes?.nodes?.[0];
  const filenames = new Set([
    ...(theme?.productJson?.nodes || []),
    ...(theme?.productLiquid?.nodes || []),
    ...(theme?.indexJson?.nodes || []),
    ...(theme?.indexLiquid?.nodes || [])
  ].map((file) => file.filename).filter(Boolean));
  return {
    themeName: theme?.name || "Published theme",
    product: templateTypeFromFilenames(filenames, "product"),
    index: templateTypeFromFilenames(filenames, "index")
  };
}

function templateTypeFromFilenames(filenames: Set<string | undefined>, template: "product" | "index"): ThemeTemplateType {
  if (filenames.has(`templates/${template}.json`)) return "json";
  if (filenames.has(`templates/${template}.liquid`)) return "liquid";
  return "unknown";
}

function buildBrandManualInstallCode(layout: BrandTrustWidget["layout"], brandSlug: string) {
  return `<div class="fbr-widget" data-brand="${brandSlug}" data-layout="${layout}"></div>
<script async src="https://www.furniturebrandreviews.com/widget.js"></script>`;
}
