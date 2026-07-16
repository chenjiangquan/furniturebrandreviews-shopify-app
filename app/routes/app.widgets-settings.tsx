import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import * as React from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  Text,
  TextField
} from "@shopify/polaris";
import prisma from "~/db.server";
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

type ThemeWidgetKey = "reviewWidget" | "starRating" | "brandCarousel" | "brandMicro";

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
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
  let themeInstallStatuses: Record<ThemeWidgetKey, boolean> = {
    reviewWidget: false,
    starRating: false,
    brandCarousel: false,
    brandMicro: false
  };

  try {
    if (session.accessToken) {
      await syncShopContactFromShopify(shopDomain, session.accessToken);
    }
    const [, loadedWidgetSettings, loadedGoogleSeoSettings, loadedShop] = await Promise.all([
      getProductReviewWidgetSettings(shopDomain),
      prisma.widgetSettings.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } }),
      prisma.googleSeoSettings.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } }),
      prisma.shop.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } })
    ]);
    widgetSettings = loadedWidgetSettings;
    googleSeoSettings = loadedGoogleSeoSettings;
    shop = {
      notificationEmail: loadedShop.notificationEmail || "",
      storeEmail: loadedShop.storeEmail || "",
      contactEmail: loadedShop.contactEmail || "",
      reviewEmailNotificationsEnabled: loadedShop.reviewEmailNotificationsEnabled,
      questionEmailNotificationsEnabled: loadedShop.questionEmailNotificationsEnabled
    };
    themeInstallStatuses = await detectThemeCodeInstallStatuses(session.shop, session.accessToken || "");
  } catch (error) {
    console.error("Widgets Settings loader failed; rendering fallback UI", error);
  }

  const themeEditorUrl = `https://${session.shop}/admin/themes/current/editor?template=product`;
  const brandSlug = widgetSettings.brandSlug || brandSlugFromProfileUrl(widgetSettings.profileUrl) || "";
  const brandProfileUrl = widgetSettings.profileUrl?.includes("/review/") ? widgetSettings.profileUrl : "";
  const googleSeoInstalled =
    googleSeoSettings.reviewsSiteEnabled &&
    googleSeoSettings.seoRichSnippetsEnabled &&
    googleSeoSettings.googleShoppingEnabled;

  return {
    googleSeoInstalled,
    themeEditorUrl,
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
    themeInstallStatuses
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "installThemeCode" || intent === "uninstallThemeCode") {
    const widgetKey = String(form.get("widgetKey") || "") as ThemeWidgetKey;
    if (!isThemeWidgetKey(widgetKey)) {
      return { ok: false, id: "", error: "Unsupported widget.", message: "", brandProfile: null, themeWidgetKey: "", installed: false };
    }

    try {
      const currentSettings = await prisma.widgetSettings.upsert({
        where: { shopDomain: session.shop },
        update: {},
        create: { shopDomain: session.shop }
      });
      const brandSlug = currentSettings.brandSlug || slugifyBrandName(currentSettings.brandName || "");
      if ((widgetKey === "brandCarousel" || widgetKey === "brandMicro") && !brandSlug) {
        return {
          ok: false,
          id: "",
          error: "Enter and save your brand name before installing this widget.",
          message: "",
          brandProfile: null,
          themeWidgetKey: widgetKey,
          installed: false
        };
      }

      if (intent === "installThemeCode") {
        await installThemeWidgetCode(session.shop, session.accessToken || "", widgetKey, brandSlug);
        return {
          ok: true,
          id: "",
          error: "",
          message: "Widget code installed in your live theme.",
          brandProfile: null,
          themeWidgetKey: widgetKey,
          installed: true
        };
      }

      await uninstallThemeWidgetCode(session.shop, session.accessToken || "", widgetKey);
      return {
        ok: true,
        id: "",
        error: "",
        message: "Widget code removed from your live theme.",
        brandProfile: null,
        themeWidgetKey: widgetKey,
        installed: false
      };
    } catch (error) {
      console.error("Theme code install action failed", error);
      return {
        ok: false,
        id: "",
        error: error instanceof Error ? error.message : "Theme code update failed.",
        message: "",
        brandProfile: null,
        themeWidgetKey: widgetKey,
        installed: false
      };
    }
  }

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
  const { googleSeoInstalled, themeEditorUrl, brandProfile, notificationSettings, brandProfileExists, themeInstallStatuses } = useLoaderData<typeof loader>();
  const brandFetcher = useFetcher<typeof action>();
  const notificationFetcher = useFetcher<typeof action>();
  const themeCodeFetcher = useFetcher<typeof action>();
  const [manualWidget, setManualWidget] = React.useState<BrandTrustWidget | null>(null);
  const [brandName, setBrandName] = React.useState(brandProfile.brandName);
  const [notificationEmail, setNotificationEmail] = React.useState(notificationSettings.notificationEmail);
  const [reviewEmailNotificationsEnabled, setReviewEmailNotificationsEnabled] = React.useState(notificationSettings.reviewEmailNotificationsEnabled);
  const [questionEmailNotificationsEnabled, setQuestionEmailNotificationsEnabled] = React.useState(notificationSettings.questionEmailNotificationsEnabled);
  const savedBrandProfile = brandFetcher.data?.ok && brandFetcher.data.brandProfile
    ? brandFetcher.data.brandProfile
    : brandProfile;
  const brandSlug = savedBrandProfile.brandSlug;
  const [installedState, setInstalledState] = React.useState<Record<ThemeWidgetKey, boolean>>(themeInstallStatuses);

  React.useEffect(() => {
    setInstalledState(themeInstallStatuses);
  }, [themeInstallStatuses]);

  React.useEffect(() => {
    if (
      themeCodeFetcher.data?.ok &&
      "themeWidgetKey" in themeCodeFetcher.data &&
      themeCodeFetcher.data.themeWidgetKey
    ) {
      const key = themeCodeFetcher.data.themeWidgetKey as ThemeWidgetKey;
      const installed = "installed" in themeCodeFetcher.data ? Boolean(themeCodeFetcher.data.installed) : false;
      setInstalledState((current) => ({ ...current, [key]: installed }));
    }
  }, [themeCodeFetcher.data]);

  return (
    <Page
      fullWidth
      title="Widgets Settings"
      subtitle="Manage storefront widgets through Theme App Extension blocks."
    >
      <BlockStack gap="500">
        <WidgetSection title="Product Review Widgets">
          {productReviewWidgets.map((widget) => {
            const widgetKey = widget.key as ThemeWidgetKey;
            return (
              <WidgetCard key={widget.title} title={widget.title} description={widget.description} image={widget.image}>
                <Badge tone={installedState[widgetKey] ? "success" : "attention"}>
                  {installedState[widgetKey] ? "Installed by code" : "Not installed"}
                </Badge>
                <ButtonGroup>
                  <ThemeCodeButton fetcher={themeCodeFetcher} widgetKey={widgetKey} installed={installedState[widgetKey]} />
                  <Button url={widget.customizeUrl} variant="primary">Customize</Button>
                </ButtonGroup>
              </WidgetCard>
            );
          })}
        </WidgetSection>

        <WidgetSection title="Brand Trust Widgets">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">FurnitureBrandReviews business profile</Text>
              <Text as="p" tone="subdued">
                Make sure your business has a profile on FurnitureBrandReviews.com before installing this widget, otherwise the widget may not display any reviews.
              </Text>
              <brandFetcher.Form method="post">
                <input type="hidden" name="intent" value="saveBrandProfile" />
                <InlineStack gap="300" blockAlign="end">
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <TextField
                      label="Brand name"
                      name="brandName"
                      value={brandName}
                      onChange={setBrandName}
                      autoComplete="organization"
                      placeholder="Enter your brand name"
                    />
                  </div>
                  <Button submit variant="primary" loading={brandFetcher.state !== "idle"}>Save brand name</Button>
                </InlineStack>
              </brandFetcher.Form>
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
                  <InlineStack gap="300">
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
              {brandSlug ? <Text as="p" tone="subdued">Brand slug: {brandSlug}</Text> : null}
              {brandFetcher.data?.ok ? <Badge tone="success">Brand name saved</Badge> : null}
              {brandFetcher.data && !brandFetcher.data.ok ? <Text as="p" tone="critical">{brandFetcher.data.error}</Text> : null}
            </BlockStack>
          </Card>
          {brandTrustWidgets.map((widget) => {
            const canInstall = Boolean(brandSlug);
            const widgetKey = widget.key as ThemeWidgetKey;
            return (
            <WidgetCard key={widget.title} title={widget.title} description={widget.description} image={widget.image}>
              {!canInstall ? <Text as="p" tone="critical">Enter your brand name before installing this widget.</Text> : null}
              <Badge tone={installedState[widgetKey] ? "success" : "attention"}>
                {installedState[widgetKey] ? "Installed by code" : "Not installed"}
              </Badge>
              <ButtonGroup>
                <ThemeCodeButton fetcher={themeCodeFetcher} widgetKey={widgetKey} installed={installedState[widgetKey]} disabled={!canInstall} />
                <Button onClick={() => setManualWidget(widget)} disabled={!canInstall}>Manual install</Button>
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
            <Badge tone={googleSeoInstalled ? "success" : "attention"}>
              {googleSeoInstalled ? "Installed" : "Settings only"}
            </Badge>
            <Button url="/app/google-seo" variant="primary">Manage</Button>
          </WidgetCard>
        </WidgetSection>

        <ManualInstallModal
          widget={manualWidget}
          brandSlug={brandSlug}
          onClose={() => setManualWidget(null)}
        />
        {themeCodeFetcher.data?.message ? <Badge tone="success">{themeCodeFetcher.data.message}</Badge> : null}
        {themeCodeFetcher.data?.error ? <Text as="p" tone="critical">{themeCodeFetcher.data.error}</Text> : null}
      </BlockStack>
    </Page>
  );
}

function ThemeCodeButton({
  fetcher,
  widgetKey,
  installed,
  disabled = false
}: {
  fetcher: ReturnType<typeof useFetcher<typeof action>>;
  widgetKey: ThemeWidgetKey;
  installed: boolean;
  disabled?: boolean;
}) {
  const loading = fetcher.state !== "idle" && fetcher.formData?.get("widgetKey") === widgetKey;

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value={installed ? "uninstallThemeCode" : "installThemeCode"} />
      <input type="hidden" name="widgetKey" value={widgetKey} />
      <Button submit loading={loading} disabled={disabled}>
        {installed ? "Uninstall" : "Install"}
      </Button>
    </fetcher.Form>
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

function WidgetCard({ title, description, image, children }: { title: string; description: string; image: string; children: React.ReactNode }) {
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
            <Text as="p" tone="subdued">Instruction: click Add section → Add app → choose the one you want.</Text>
            <BlockStack gap="300">{children}</BlockStack>
          </BlockStack>
        </Box>
      </BlockStack>
    </Card>
  );
}

function ManualInstallModal({ widget, brandSlug, onClose }: { widget: BrandTrustWidget | null; brandSlug: string; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const code = widget
    ? `<div class="fbr-widget" data-brand="${brandSlug}" data-layout="${widget.layout}"></div>\n<script async src="https://www.furniturebrandreviews.com/widget.js"></script>`
    : "";

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
        <BlockStack gap="300">
          <Text as="p">Paste this code into your theme, page, blog, or custom liquid section.</Text>
          <Box background="bg-surface-secondary" borderRadius="200" padding="300">
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <code>{code}</code>
            </pre>
          </Box>
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

const apiVersion = "2025-10";
const themeAssetCandidates = [
  "sections/main-product.liquid",
  "sections/product-template.liquid",
  "templates/product.liquid"
];

const themeWidgetMarkers: Record<ThemeWidgetKey, { label: string; start: string; end: string }> = {
  reviewWidget: {
    label: "Review Widget",
    start: "<!-- FBR_REVIEW_WIDGET_START -->",
    end: "<!-- FBR_REVIEW_WIDGET_END -->"
  },
  starRating: {
    label: "Star Rating Badge",
    start: "<!-- FBR_STAR_RATING_START -->",
    end: "<!-- FBR_STAR_RATING_END -->"
  },
  brandCarousel: {
    label: "Brand Review Carousel",
    start: "<!-- FBR_BRAND_CAROUSEL_START -->",
    end: "<!-- FBR_BRAND_CAROUSEL_END -->"
  },
  brandMicro: {
    label: "Brand Micro Trust Badge",
    start: "<!-- FBR_BRAND_MICRO_START -->",
    end: "<!-- FBR_BRAND_MICRO_END -->"
  }
};

function isThemeWidgetKey(value: string): value is ThemeWidgetKey {
  return ["reviewWidget", "starRating", "brandCarousel", "brandMicro"].includes(value);
}

async function detectThemeCodeInstallStatuses(shopDomain: string, accessToken: string) {
  const statuses: Record<ThemeWidgetKey, boolean> = {
    reviewWidget: false,
    starRating: false,
    brandCarousel: false,
    brandMicro: false
  };
  if (!accessToken) return statuses;

  const themeId = await getMainThemeId(shopDomain, accessToken);
  const assets = await Promise.all(
    themeAssetCandidates.map(async (assetKey) => ({
      assetKey,
      value: await getThemeAsset(shopDomain, accessToken, themeId, assetKey).catch(() => "")
    }))
  );
  for (const key of Object.keys(themeWidgetMarkers) as ThemeWidgetKey[]) {
    statuses[key] = assets.some((asset) => asset.value.includes(themeWidgetMarkers[key].start));
  }

  return statuses;
}

async function installThemeWidgetCode(shopDomain: string, accessToken: string, widgetKey: ThemeWidgetKey, brandSlug: string) {
  if (!accessToken) {
    throw new Error("Missing Shopify access token. Please reinstall the app and approve theme write permissions.");
  }

  const themeId = await getMainThemeId(shopDomain, accessToken);
  const target = await findWritableProductThemeAsset(shopDomain, accessToken, themeId);
  const marker = themeWidgetMarkers[widgetKey];
  if (target.value.includes(marker.start)) {
    return;
  }

  const nextValue = insertThemeWidgetCode(target.value, buildThemeWidgetSnippet(widgetKey, brandSlug));
  await putThemeAsset(shopDomain, accessToken, themeId, target.assetKey, nextValue);
}

async function uninstallThemeWidgetCode(shopDomain: string, accessToken: string, widgetKey: ThemeWidgetKey) {
  if (!accessToken) {
    throw new Error("Missing Shopify access token. Please reinstall the app and approve theme write permissions.");
  }

  const themeId = await getMainThemeId(shopDomain, accessToken);
  const marker = themeWidgetMarkers[widgetKey];
  const assets = await Promise.all(
    themeAssetCandidates.map(async (assetKey) => ({
      assetKey,
      value: await getThemeAsset(shopDomain, accessToken, themeId, assetKey).catch(() => "")
    }))
  );

  for (const asset of assets) {
    if (!asset.value.includes(marker.start)) continue;
    const nextValue = removeMarkedThemeCode(asset.value, marker.start, marker.end);
    await putThemeAsset(shopDomain, accessToken, themeId, asset.assetKey, nextValue);
  }
}

async function findWritableProductThemeAsset(shopDomain: string, accessToken: string, themeId: string) {
  for (const assetKey of themeAssetCandidates) {
    try {
      const value = await getThemeAsset(shopDomain, accessToken, themeId, assetKey);
      if (value) return { assetKey, value };
    } catch {
      // Try the next common product template file.
    }
  }

  throw new Error("Could not find a supported product template file in the live theme. Use Manual install for this theme.");
}

function buildThemeWidgetSnippet(widgetKey: ThemeWidgetKey, brandSlug: string) {
  const marker = themeWidgetMarkers[widgetKey];
  const appUrl = (process.env.SHOPIFY_APP_URL || "https://app.furniturebrandreviews.com").replace(/\/$/, "");
  const productAttrs = `data-api-base="/apps/fbr"\n  data-shop="{{ shop.permanent_domain }}"\n  data-product-id="{{ product.id }}"\n  data-product-handle="{{ product.handle }}"\n  data-product-title="{{ product.title | escape }}"`;
  let body = "";

  if (widgetKey === "reviewWidget") {
    body = `<link rel="stylesheet" href="${appUrl}/fbr-widgets.css">\n<script src="${appUrl}/fbr-widgets.js" defer></script>\n<div class="fbr-widget" data-fbr-product-reviews ${productAttrs}></div>`;
  } else if (widgetKey === "starRating") {
    body = `<link rel="stylesheet" href="${appUrl}/fbr-widgets.css">\n<script src="${appUrl}/fbr-widgets.js" defer></script>\n<div class="fbr-widget" data-fbr-product-stars ${productAttrs}></div>`;
  } else if (widgetKey === "brandCarousel") {
    body = `<div class="fbr-widget" data-brand="${brandSlug}" data-layout="carousel"></div>\n<script async src="https://www.furniturebrandreviews.com/widget.js"></script>`;
  } else {
    body = `<div class="fbr-widget" data-brand="${brandSlug}" data-layout="micro"></div>\n<script async src="https://www.furniturebrandreviews.com/widget.js"></script>`;
  }

  return `\n${marker.start}\n${body}\n${marker.end}\n`;
}

function insertThemeWidgetCode(themeValue: string, snippet: string) {
  const schemaIndex = themeValue.indexOf("{% schema %}");
  if (schemaIndex >= 0) {
    return `${themeValue.slice(0, schemaIndex).trimEnd()}\n${snippet}\n${themeValue.slice(schemaIndex)}`;
  }

  return `${themeValue.trimEnd()}\n${snippet}\n`;
}

function removeMarkedThemeCode(themeValue: string, start: string, end: string) {
  const pattern = new RegExp(`\\n?${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "g");
  return themeValue.replace(pattern, "\n");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getMainThemeId(shopDomain: string, accessToken: string) {
  const data = await shopifyRest<{ themes: Array<{ id: number; role: string }> }>(shopDomain, accessToken, "/themes.json");
  const theme = data.themes.find((item) => item.role === "main") || data.themes.find((item) => item.role === "live");
  if (!theme) {
    throw new Error("Could not find the live theme.");
  }
  return String(theme.id);
}

async function getThemeAsset(shopDomain: string, accessToken: string, themeId: string, assetKey: string) {
  const params = new URLSearchParams({ "asset[key]": assetKey });
  const data = await shopifyRest<{ asset?: { value?: string } }>(
    shopDomain,
    accessToken,
    `/themes/${themeId}/assets.json?${params.toString()}`
  );
  return data.asset?.value || "";
}

async function putThemeAsset(shopDomain: string, accessToken: string, themeId: string, assetKey: string, value: string) {
  await shopifyRest(shopDomain, accessToken, `/themes/${themeId}/assets.json`, {
    method: "PUT",
    body: JSON.stringify({ asset: { key: assetKey, value } })
  });
}

async function shopifyRest<T = unknown>(shopDomain: string, accessToken: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = typeof data?.errors === "string"
      ? data.errors
      : JSON.stringify(data?.errors || data);
    throw new Error(`Shopify theme API failed (${response.status}): ${message}`);
  }
  return data as T;
}
