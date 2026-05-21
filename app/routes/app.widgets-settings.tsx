import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import * as React from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  Text
} from "@shopify/polaris";
import prisma from "~/db.server";
import { getProductReviewWidgetSettings } from "~/models/reviews.server";
import { authenticate } from "~/shopify.server";

type BrandTrustWidget = {
  key: "brandCarousel" | "brandMicro";
  title: string;
  description: string;
  image: string;
  layout: "carousel" | "micro";
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
  brandName: "Weilai Concept",
  brandSlug: "weilai-concept",
  brandProfileUrl: "https://www.furniturebrandreviews.com/review/weilai-concept"
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  let productSettings = {
    productReviewWidgetEnabled: true
  };
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
  let installedBlocks = emptyInstalledBlocks;

  try {
    const [loadedProductSettings, loadedWidgetSettings, loadedGoogleSeoSettings, loadedInstalledBlocks] = await Promise.all([
      getProductReviewWidgetSettings(shopDomain),
      prisma.widgetSettings.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } }),
      prisma.googleSeoSettings.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } }),
      detectInstalledThemeBlocks(session.shop, session.accessToken)
    ]);
    productSettings = loadedProductSettings;
    widgetSettings = loadedWidgetSettings;
    googleSeoSettings = loadedGoogleSeoSettings;
    installedBlocks = loadedInstalledBlocks;
  } catch (error) {
    console.error("Widgets Settings loader failed; rendering fallback UI", error);
  }

  const themeEditorUrl = `https://${session.shop}/admin/themes/current/editor?context=apps&template=product`;
  const brandSlug = widgetSettings.brandSlug || brandSlugFromProfileUrl(widgetSettings.profileUrl) || defaultBrandProfile.brandSlug;
  const brandProfileUrl = widgetSettings.profileUrl?.includes("/review/")
    ? widgetSettings.profileUrl
    : defaultBrandProfile.brandProfileUrl;
  const googleSeoInstalled =
    googleSeoSettings.reviewsSiteEnabled &&
    googleSeoSettings.seoRichSnippetsEnabled &&
    googleSeoSettings.googleShoppingEnabled;

  return {
    installedBlocks: {
      ...installedBlocks,
      reviewWidget: productSettings.productReviewWidgetEnabled || installedBlocks.reviewWidget
    },
    googleSeoInstalled,
    themeEditorUrl,
    brandProfile: {
      brandName: widgetSettings.brandName || defaultBrandProfile.brandName,
      brandSlug,
      brandProfileUrl
    },
    brandProfileExists: true
  };
};

export default function WidgetsSettings() {
  const { installedBlocks, googleSeoInstalled, themeEditorUrl, brandProfile, brandProfileExists } = useLoaderData<typeof loader>();
  const [manualWidget, setManualWidget] = React.useState<BrandTrustWidget | null>(null);

  return (
    <Page
      fullWidth
      title="Widgets Settings"
      subtitle="Manage storefront widgets through Theme App Extension blocks and app embeds."
    >
      <BlockStack gap="500">
        <WidgetSection title="Product Review Widgets">
          {productReviewWidgets.map((widget) => {
            const installed = installedBlocks[widget.key as keyof typeof installedBlocks];
            const status = installed ? "Installed" : "Not installed";
            const tone = installed ? "success" : "attention";

            return (
              <WidgetCard key={widget.title} title={widget.title} description={widget.description} image={widget.image}>
                <Badge tone={tone}>{status}</Badge>
                <ButtonGroup>
                  <Button url={themeEditorUrl} target="_blank">{installed ? "Uninstall" : "Install"}</Button>
                  <Button url={widget.customizeUrl} variant="primary">Customize</Button>
                </ButtonGroup>
              </WidgetCard>
            );
          })}
        </WidgetSection>

        <WidgetSection title="Brand Trust Widgets">
          {brandTrustWidgets.map((widget) => {
            const installed = installedBlocks[widget.key];
            return (
            <WidgetCard key={widget.title} title={widget.title} description={widget.description} image={widget.image}>
              <Badge tone={installed ? "success" : brandProfileExists ? "attention" : "warning"}>{installed ? "Installed" : brandProfileExists ? "Ready to install" : "Not connected"}</Badge>
              <ButtonGroup>
                <Button url={themeEditorUrl} target="_blank">{installed ? "Uninstall" : "Install"}</Button>
                <Button onClick={() => setManualWidget(widget)}>Manual install</Button>
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
          brandSlug={brandProfile.brandSlug}
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

type InstalledThemeBlocks = {
  reviewWidget: boolean;
  starRating: boolean;
  brandCarousel: boolean;
  brandMicro: boolean;
};

const emptyInstalledBlocks: InstalledThemeBlocks = {
  reviewWidget: false,
  starRating: false,
  brandCarousel: false,
  brandMicro: false
};

async function detectInstalledThemeBlocks(shop: string, accessToken?: string | null): Promise<InstalledThemeBlocks> {
  if (!accessToken) return emptyInstalledBlocks;

  try {
    const headers = {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json"
    };
    const themesResponse = await fetch(`https://${shop}/admin/api/2025-04/themes.json`, { headers });
    if (!themesResponse.ok) return emptyInstalledBlocks;
    const themesJson = await themesResponse.json() as { themes?: Array<{ id: number; role: string }> };
    const liveTheme = themesJson.themes?.find((theme) => theme.role === "main");
    if (!liveTheme) return emptyInstalledBlocks;

    const assetsResponse = await fetch(`https://${shop}/admin/api/2025-04/themes/${liveTheme.id}/assets.json`, { headers });
    if (!assetsResponse.ok) return emptyInstalledBlocks;
    const assetsJson = await assetsResponse.json() as { assets?: Array<{ key: string }> };
    const jsonAssetKeys = (assetsJson.assets || [])
      .map((asset) => asset.key)
      .filter((key) => (key.startsWith("templates/") || key.startsWith("sections/")) && key.endsWith(".json"));

    const assetContents = await Promise.all(jsonAssetKeys.map(async (key) => {
      const assetUrl = new URL(`https://${shop}/admin/api/2025-04/themes/${liveTheme.id}/assets.json`);
      assetUrl.searchParams.set("asset[key]", key);
      const response = await fetch(assetUrl, { headers });
      if (!response.ok) return "";
      const json = await response.json() as { asset?: { value?: string } };
      return json.asset?.value || "";
    }));
    const themeJson = assetContents.join("\n").toLowerCase();

    return {
      reviewWidget: themeJson.includes("product-reviews-widget") || themeJson.includes("review-widget"),
      starRating: themeJson.includes("product-star-rating"),
      brandCarousel: themeJson.includes("fbr-brand-review-carousel") || themeJson.includes("brand-review-carousel"),
      brandMicro: themeJson.includes("fbr-brand-micro-trust-badge") || themeJson.includes("fbr-micro")
    };
  } catch (error) {
    console.warn("Unable to detect installed theme app blocks", error);
    return emptyInstalledBlocks;
  }
}
