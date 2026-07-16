import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import * as React from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  ColorPicker,
  Divider,
  InlineGrid,
  InlineStack,
  Page,
  Popover,
  RangeSlider,
  Select,
  Text,
  TextField
} from "@shopify/polaris";
import { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import { defaultProductReviewWidgetSettings } from "~/models/product-review-widget-settings";
import { getProductReviewWidgetSettings } from "~/models/reviews.server";
import { authenticate } from "~/shopify.server";

type WidgetSettings = typeof defaultProductReviewWidgetSettings;
type ProductReviewSettingsInput = Partial<Record<keyof WidgetSettings, boolean | number | string>>;

const productReviewSettingsFieldNames = new Set(
  Prisma.dmmf.datamodel.models
    .find((model) => model.name === "ProductReviewSettings")
    ?.fields
    .filter((field) => field.kind === "scalar" && !["id", "shopDomain", "createdAt", "updatedAt"].includes(field.name))
    .map((field) => field.name) || []
);

const booleanFields = [
  "productReviewsEnabled",
  "productReviewWidgetEnabled",
  "autoApproveReviews",
  "requireEmail",
  "showVerifiedBadge",
  "allowPhotoReviews",
  "emailNotificationEnabled",
  "carouselAutoSlide",
  "carouselShowArrows",
  "carouselShowDots",
  "showAverageRating",
  "showReviewCount",
  "showRatingBreakdown",
  "showWriteReviewButton",
  "showAskQuestionButton",
  "showAiSummary",
  "showReviewHighlights",
  "showPhotoSummary",
  "showReviewerPhotos",
  "hideReviewDate"
] as const;

const numberFields = [
  "borderRadius",
  "widgetBorderRadius",
  "widgetBorderWidth",
  "reviewCardSpacing",
  "ratingBadgeBorderRadius",
  "ratingBadgePadding",
  "starSize",
  "starGap",
  "avatarSize",
  "titleFontSize",
  "contentFontSize",
  "photoSummaryLimit",
  "carouselCardsPerRow",
  "carouselAutoplaySpeed",
  "reviewsPerPage",
  "reviewsPerRow"
] as const;

const textFields = [
  "starColor",
  "ratingBarColor",
  "ratingBadgeBackgroundColor",
  "avatarBackgroundColor",
  "avatarTextColor",
  "buttonBackgroundColor",
  "buttonTextColor",
  "textColor",
  "lighterTextColor",
  "titleTextColor",
  "contentTextColor",
  "borderColor",
  "cardBackgroundColor",
  "widgetBackgroundColor",
  "layoutType",
  "sortDefault"
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getProductReviewWidgetSettings(session.shop);
  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const shopDomain = session.shop;
  await prisma.shop.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain }
  });

  if (form.get("intent") === "reset") {
    const resetData = supportedProductReviewSettingsData(defaultProductReviewWidgetSettings);
    try {
      const savedSettings = await prisma.productReviewSettings.upsert({
        where: { shopDomain },
        update: resetData,
        create: { shopDomain, ...resetData }
      });
      return { ok: true, error: "", settings: savedSettings, savedAt: new Date().toISOString() };
    } catch (error) {
      console.error("Product review widget reset failed", error);
      return { ok: false, error: `Settings could not be reset: ${errorMessage(error)}`, settings: null, savedAt: "" };
    }
  }

  const data = {
    ...Object.fromEntries(booleanFields.map((field) => [field, form.get(field) === "true"])),
    ...Object.fromEntries(numberFields.map((field) => [field, numberFromForm(form, field)])),
    ...Object.fromEntries(textFields.map((field) => [field, textFromForm(form, field)]))
  };
  data.layoutType = ["standard", "cards", "carousel"].includes(String(data.layoutType)) ? String(data.layoutType) : "standard";
  data.photoSummaryLimit = Math.max(4, Math.min(20, Number(data.photoSummaryLimit) || defaultProductReviewWidgetSettings.photoSummaryLimit));
  const submittedWidgetBorderWidth = Math.max(0, Math.min(3, numberFromForm(form, "widgetBorderWidth")));
  const submittedWidgetBorderRadius = Math.max(0, Math.min(32, numberFromForm(form, "widgetBorderRadius")));
  data.widgetBorderWidth = submittedWidgetBorderWidth;
  data.widgetBorderRadius = submittedWidgetBorderRadius;
  data.reviewsPerRow = Math.max(2, Math.min(4, Number(data.reviewsPerRow) || defaultProductReviewWidgetSettings.reviewsPerRow));

  try {
    const supportedData = supportedProductReviewSettingsData(data);
    await prisma.productReviewSettings.upsert({
      where: { shopDomain },
      update: supportedData,
      create: { shopDomain, ...supportedProductReviewSettingsData(defaultProductReviewWidgetSettings), ...supportedData }
    });

    const savedSettings = await prisma.productReviewSettings.findUniqueOrThrow({ where: { shopDomain } });

    return { ok: true, error: "", settings: savedSettings, savedAt: new Date().toISOString() };
  } catch (error) {
    console.error("Product review widget settings save failed", error);
    return { ok: false, error: `Settings could not be saved: ${errorMessage(error)}`, settings: null, savedAt: "" };
  }
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Unknown error");
}

function supportedProductReviewSettingsData(data: ProductReviewSettingsInput) {
  return Object.fromEntries(
    Object.entries(data).filter(([field]) => productReviewSettingsFieldNames.has(field))
  );
}

function numberFromForm(form: FormData, field: (typeof numberFields)[number]) {
  const rawValue = form.get(field);
  if (rawValue === null || rawValue === "") return defaultProductReviewWidgetSettings[field];
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : defaultProductReviewWidgetSettings[field];
}

function textFromForm(form: FormData, field: (typeof textFields)[number]) {
  const rawValue = form.get(field);
  return rawValue === null ? defaultProductReviewWidgetSettings[field] : String(rawValue);
}

function sliderNumber(value: number | [number, number]) {
  return Number(Array.isArray(value) ? value[0] : value);
}

export default function ProductReviewWidgetSettings() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [draft, setDraft] = React.useState<WidgetSettings>(normalizeWidgetSettings({
    ...defaultProductReviewWidgetSettings,
    ...settings
  }));
  const saving = fetcher.state !== "idle";
  const savedAt = fetcher.data?.ok && fetcher.data.savedAt
    ? new Date(fetcher.data.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  React.useEffect(() => {
    const settings = fetcher.data?.ok ? fetcher.data.settings : null;
    if (settings) {
      setDraft((current) => normalizeWidgetSettings({
        ...current,
        ...settings
      }));
    }
  }, [fetcher.data]);

  const setValue = <Key extends keyof WidgetSettings>(key: Key, value: WidgetSettings[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const resetDraft = () => {
    setDraft(defaultProductReviewWidgetSettings);
  };

  return (
    <Page
      fullWidth
      title="Product Review Widget"
      subtitle="Customize the Theme App Extension block without editing theme code."
      backAction={{ content: "Widgets Settings", url: "/app/widgets-settings" }}
    >
      <fetcher.Form method="post">
        <HiddenSettings settings={draft} />
        <InlineGrid columns={{ xs: 1, lg: "360px 1fr" }} gap="500">
          <BlockStack gap="400">
            {fetcher.data?.ok ? (
              <Card>
                <InlineStack align="space-between" blockAlign="center" gap="300">
                  <BlockStack gap="100">
                    <Text as="p" variant="headingSm">Settings saved</Text>
                    <Text as="p" tone="subdued">Your widget settings were saved{savedAt ? ` at ${savedAt}` : ""}.</Text>
                  </BlockStack>
                  <Badge tone="success">Saved</Badge>
                </InlineStack>
              </Card>
            ) : null}
            {fetcher.data && !fetcher.data.ok ? (
              <Card>
                <Text as="p" tone="critical">{fetcher.data.error}</Text>
              </Card>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Color and Styling</Text>
                <Text as="h3" variant="headingSm">Star appearance</Text>
                <ColorField label="Star fill color" value={draft.starColor} onChange={(value) => setValue("starColor", value)} />
                <RangeSlider label="Star size" min={14} max={34} value={draft.starSize} onChange={(value) => setValue("starSize", sliderNumber(value))} output />
                <RangeSlider label="Star gap" min={-4} max={8} value={draft.starGap} onChange={(value) => setValue("starGap", sliderNumber(value))} output />
                <Divider />
                <ColorField label="Rating bar color" value={draft.ratingBarColor} onChange={(value) => setValue("ratingBarColor", value)} />
                <Divider />
                <Text as="h3" variant="headingSm">Rating summary badge settings</Text>
                <ColorField label="Rating badge background color" value={draft.ratingBadgeBackgroundColor} onChange={(value) => setValue("ratingBadgeBackgroundColor", value)} />
                <RangeSlider label="Rating badge border radius" min={0} max={999} step={1} value={draft.ratingBadgeBorderRadius} onChange={(value) => setValue("ratingBadgeBorderRadius", sliderNumber(value))} output />
                <RangeSlider label="Rating badge padding" min={4} max={24} value={draft.ratingBadgePadding} onChange={(value) => setValue("ratingBadgePadding", sliderNumber(value))} output />
                <Divider />
                <ColorField label="Button background color" value={draft.buttonBackgroundColor} onChange={(value) => setValue("buttonBackgroundColor", value)} />
                <ColorField label="Button text color" value={draft.buttonTextColor} onChange={(value) => setValue("buttonTextColor", value)} />
                <ColorField label="Border color" value={draft.borderColor} onChange={(value) => setValue("borderColor", value)} />
                <ColorField label="Card background color" value={draft.cardBackgroundColor} onChange={(value) => setValue("cardBackgroundColor", value)} />
                <Divider />
                <Text as="h3" variant="headingSm">Widget container settings</Text>
                <ColorField label="Widget background color" value={draft.widgetBackgroundColor} onChange={(value) => setValue("widgetBackgroundColor", value)} />
                <RangeSlider label="Widget border" min={0} max={3} step={1} value={draft.widgetBorderWidth} onChange={(value) => setValue("widgetBorderWidth", sliderNumber(value))} output />
                <RangeSlider label="Widget border radius" min={0} max={32} step={1} value={draft.widgetBorderRadius} onChange={(value) => setValue("widgetBorderRadius", sliderNumber(value))} output />
                <Divider />
                <Toggle label="Show reviewer initials avatar" checked={draft.showReviewerPhotos} onChange={(value) => setValue("showReviewerPhotos", value)} />
                <Text as="h3" variant="headingSm">Reviewer avatar settings</Text>
                <ColorField label="Avatar background color" value={draft.avatarBackgroundColor} onChange={(value) => setValue("avatarBackgroundColor", value)} />
                <ColorField label="Avatar text color" value={draft.avatarTextColor} onChange={(value) => setValue("avatarTextColor", value)} />
                <RangeSlider label="Avatar size" min={22} max={44} value={draft.avatarSize} onChange={(value) => setValue("avatarSize", sliderNumber(value))} output />
                <RangeSlider label="Button border radius" min={0} max={24} value={draft.borderRadius} onChange={(value) => setValue("borderRadius", sliderNumber(value))} output />
                <RangeSlider label="Review card spacing" min={8} max={32} value={draft.reviewCardSpacing} onChange={(value) => setValue("reviewCardSpacing", sliderNumber(value))} output />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Widget Content Settings</Text>
                <Toggle label="Show average rating" checked={draft.showAverageRating} onChange={(value) => setValue("showAverageRating", value)} />
                <Toggle label="Show review count" checked={draft.showReviewCount} onChange={(value) => setValue("showReviewCount", value)} />
                <Toggle label="Show rating breakdown" checked={draft.showRatingBreakdown} onChange={(value) => setValue("showRatingBreakdown", value)} />
                <Toggle label="Show Write a Review button" checked={draft.showWriteReviewButton} onChange={(value) => setValue("showWriteReviewButton", value)} />
                <Toggle label="Show Ask a Question button" checked={draft.showAskQuestionButton} onChange={(value) => setValue("showAskQuestionButton", value)} />
                <Toggle label="Show AI review summary" checked={draft.showAiSummary} onChange={(value) => setValue("showAiSummary", value)} />
                <Toggle label="Show review highlights" checked={draft.showReviewHighlights} onChange={(value) => setValue("showReviewHighlights", value)} />
                <Divider />
                <Text as="h3" variant="headingSm">Photo summary settings</Text>
                <Toggle label="Show photo summary" checked={draft.showPhotoSummary} onChange={(value) => setValue("showPhotoSummary", value)} />
                <RangeSlider label="Number of photos to show" min={4} max={20} value={draft.photoSummaryLimit} onChange={(value) => setValue("photoSummaryLimit", sliderNumber(value))} output />
                <Divider />
                <Toggle label="Show verified badge" checked={draft.showVerifiedBadge} onChange={(value) => setValue("showVerifiedBadge", value)} />
                <Toggle label="Hide review date" checked={draft.hideReviewDate} onChange={(value) => setValue("hideReviewDate", value)} />
                <Divider />
                <Text as="h3" variant="headingSm">Typography and content colors</Text>
                <ColorField label="Text color" value={draft.textColor} onChange={(value) => setValue("textColor", value)} />
                <ColorField label="Lighter text color" value={draft.lighterTextColor} onChange={(value) => setValue("lighterTextColor", value)} />
                <ColorField label="Title text color" value={draft.titleTextColor} onChange={(value) => setValue("titleTextColor", value)} />
                <ColorField label="Content text color" value={draft.contentTextColor} onChange={(value) => setValue("contentTextColor", value)} />
                <RangeSlider label="Title font size" min={12} max={28} suffix="px" value={draft.titleFontSize} onChange={(value) => setValue("titleFontSize", sliderNumber(value))} output />
                <RangeSlider label="Content font size" min={12} max={22} suffix="px" value={draft.contentFontSize} onChange={(value) => setValue("contentFontSize", sliderNumber(value))} output />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Layout Settings</Text>
                <Select
                  label="Layout type"
                  options={[
                    { label: "Standard", value: "standard" },
                    { label: "Cards", value: "cards" },
                    { label: "Carousel", value: "carousel" }
                  ]}
                  value={draft.layoutType}
                  onChange={(value) => setValue("layoutType", value)}
                />
                {draft.layoutType === "carousel" ? (
                  <>
                    <Divider />
                    <Text as="h3" variant="headingSm">Carousel settings</Text>
                    <Select
                      label="Cards per row desktop"
                      options={[
                        { label: "2", value: "2" },
                        { label: "3", value: "3" },
                        { label: "4", value: "4" }
                      ]}
                      value={String(draft.carouselCardsPerRow)}
                      onChange={(value) => setValue("carouselCardsPerRow", Number(value))}
                    />
                    <Toggle label="Auto slide" checked={draft.carouselAutoSlide} onChange={(value) => setValue("carouselAutoSlide", value)} />
                    <RangeSlider label="Autoplay speed" min={2} max={10} suffix="s" value={draft.carouselAutoplaySpeed} onChange={(value) => setValue("carouselAutoplaySpeed", sliderNumber(value))} output />
                    <Toggle label="Show arrows" checked={draft.carouselShowArrows} onChange={(value) => setValue("carouselShowArrows", value)} />
                    <Toggle label="Show dots" checked={draft.carouselShowDots} onChange={(value) => setValue("carouselShowDots", value)} />
                  </>
                ) : null}
                <RangeSlider label="Reviews per page" min={1} max={12} value={draft.reviewsPerPage} onChange={(value) => setValue("reviewsPerPage", sliderNumber(value))} output />
                {draft.layoutType === "cards" ? (
                  <Select
                    label="Reviews per row"
                    options={[
                      { label: "2", value: "2" },
                      { label: "3", value: "3" },
                      { label: "4", value: "4" }
                    ]}
                    value={String(draft.reviewsPerRow)}
                    onChange={(value) => setValue("reviewsPerRow", Number(value))}
                  />
                ) : null}
                <Select
                  label="Sort default"
                  options={[
                    { label: "Newest", value: "newest" },
                    { label: "Highest rating", value: "highest_rating" },
                    { label: "Lowest rating", value: "lowest_rating" }
                  ]}
                  value={draft.sortDefault}
                  onChange={(value) => setValue("sortDefault", value)}
                />
                <InlineStack gap="200">
                  <Button submit variant="primary" loading={saving}>Save settings</Button>
                  <Button
                    onClick={() => {
                      resetDraft();
                      fetcher.submit({ intent: "reset" }, { method: "post" });
                    }}
                    disabled={saving}
                  >
                    Reset to default
                  </Button>
                </InlineStack>
                {fetcher.data?.ok ? <Badge tone="success">Saved</Badge> : null}
              </BlockStack>
            </Card>
          </BlockStack>

          <ProductReviewPreview settings={draft} />
        </InlineGrid>
      </fetcher.Form>
    </Page>
  );
}

function normalizeWidgetSettings(settings: WidgetSettings): WidgetSettings {
  const layoutType =
    settings.layoutType === "card" || settings.layoutType === "cards"
      ? "cards"
      : settings.layoutType === "carousel"
        ? "carousel"
        : "standard";

  return { ...settings, layoutType };
}

function HiddenSettings({ settings }: { settings: WidgetSettings }) {
  return (
    <>
      <input type="hidden" name="intent" value="save" />
      {[...booleanFields, ...numberFields, ...textFields].map((field) => (
        <input key={field} type="hidden" name={field} value={String(settings[field])} />
      ))}
    </>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [active, setActive] = React.useState(false);
  const color = hexToHsb(value);

  return (
    <InlineStack gap="200" blockAlign="end" wrap={false}>
      <Popover
        active={active}
        onClose={() => setActive(false)}
        activator={
          <button
            type="button"
            onClick={() => setActive((open) => !open)}
            aria-label={`Choose ${label}`}
            style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #dfe3e8", background: value, cursor: "pointer" }}
          />
        }
      >
        <Popover.Section>
          <ColorPicker color={color} onChange={(nextColor) => onChange(hsbToHex(nextColor))} />
        </Popover.Section>
      </Popover>
      <div style={{ flex: 1 }}>
        <TextField label={label} value={value} onFocus={() => setActive(true)} onChange={onChange} autoComplete="off" />
      </div>
    </InlineStack>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <Checkbox label={label} checked={checked} onChange={onChange} />;
}

function ProductReviewPreview({ settings }: { settings: WidgetSettings }) {
  const [questionOpen, setQuestionOpen] = React.useState(false);
  const [questionSent, setQuestionSent] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"reviews" | "questions">("reviews");
  const [reviewFilter, setReviewFilter] = React.useState("most_recent");
  const [previewImage, setPreviewImage] = React.useState("");
  const breakdown = [
    { rating: 5, count: 182 },
    { rating: 4, count: 42 },
    { rating: 3, count: 10 },
    { rating: 2, count: 3 },
    { rating: 1, count: 1 }
  ];
  const max = Math.max(...breakdown.map((item) => item.count));
  const totalBreakdown = Math.max(breakdown.reduce((total, item) => total + item.count, 0), 1);
  const reviewCardStyle = {
    border: `1px solid ${settings.borderColor}`,
    borderRadius: settings.borderRadius,
    background: settings.cardBackgroundColor,
    padding: settings.reviewCardSpacing,
    color: settings.textColor
  };
  const sampleReviews = [
    {
      title: "Beautiful sofa and smooth delivery",
      content: "The fabric matched the swatch and the delivery team kept us updated.",
      name: "Emily R.",
      rating: 5,
      verified: true,
      date: "May 15, 2026",
      imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=320&q=80"
    },
    {
      title: "Looks great in our living room",
      content: "The color is warm, the cushions feel supportive, and guests keep asking where we bought it.",
      name: "Priya S.",
      rating: 4.7,
      verified: true,
      date: "May 13, 2026",
      imageUrl: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=320&q=80"
    },
    {
      title: "Comfortable accent chair",
      content: "Easy assembly and the fabric texture feels more premium than expected.",
      name: "Noah T.",
      rating: 4.5,
      verified: false,
      date: "May 12, 2026",
      imageUrl: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=320&q=80"
    },
    {
      title: "Worth the wait",
      content: "The oak finish looks exactly like the sample photos.",
      name: "Olivia M.",
      rating: 5,
      verified: true,
      date: "May 11, 2026",
      imageUrl: "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=320&q=80"
    },
    {
      title: "Clean modern lines",
      content: "The sideboard arrived well packed and fits the hallway perfectly.",
      name: "Marcus W.",
      rating: 4.3,
      verified: true,
      date: "May 10, 2026",
      imageUrl: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=320&q=80"
    },
    {
      title: "Beautiful texture",
      content: "The weave looks better in person and the cushions hold shape.",
      name: "Grace C.",
      rating: 4.8,
      verified: false,
      date: "May 9, 2026",
      imageUrl: "https://images.unsplash.com/photo-1617103996702-96ff29b1c467?auto=format&fit=crop&w=320&q=80"
    },
    {
      title: "Solid dining table",
      content: "Sturdy build, clean finish, and support answered sizing questions quickly.",
      name: "Daniel K.",
      rating: 4,
      verified: false,
      date: "May 14, 2026",
      imageUrl: ""
    }
  ];
  const previewPhotos = settings.showPhotoSummary ? sampleReviews.filter((review) => review.imageUrl) : [];
  const previewPhotoUrls = previewPhotos.map((review) => review.imageUrl).filter(Boolean);
  const previewReviews = sortPreviewReviews(sampleReviews, reviewFilter).slice(0, settings.reviewsPerPage);
  const previewQuestions = [
    {
      customerName: "Mia L.",
      createdAt: "May 15, 2026",
      question: "Does this sofa fit through a narrow hallway?",
      answer: "The delivery team can remove the legs and confirm access before arrival."
    }
  ];

  return (
    <div style={{ position: "sticky", top: 16, alignSelf: "start", minWidth: 0, overflow: "hidden", width: "100%" }}>
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="start">
            <BlockStack gap="100">
              <Text as="p" tone="subdued">Previewing: Sample data</Text>
            </BlockStack>
            {settings.productReviewWidgetEnabled ? <Badge tone="success">Enabled</Badge> : <Badge>Disabled</Badge>}
          </InlineStack>
          <Divider />
          <div
            style={{
              background: settings.widgetBackgroundColor,
              border: Number(settings.widgetBorderWidth) > 0 ? `${settings.widgetBorderWidth}px solid ${settings.borderColor}` : "0",
              borderRadius: settings.widgetBorderRadius,
              color: settings.textColor,
              maxWidth: "none",
              padding: 20,
              width: "100%"
            }}
          >
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" gap="300">
                <Text as="h2" variant="headingLg">Customer Reviews</Text>
                <InlineStack gap="200">
                  {settings.showWriteReviewButton ? <PreviewButton settings={settings}>Write a review</PreviewButton> : null}
                  {settings.showAskQuestionButton ? <PreviewButton settings={settings} secondary onClick={() => setQuestionOpen(true)}>Ask a question</PreviewButton> : null}
                </InlineStack>
              </InlineStack>

              <div style={{ alignItems: "start", display: "grid", gap: 28, gridTemplateColumns: "minmax(160px, 220px) minmax(260px, 1fr)" }}>
                <BlockStack gap="200">
                  <Text as="p" tone="subdued" variant="headingSm">Average rating</Text>
                  {settings.showAverageRating ? (
                    <InlineStack gap="200" blockAlign="baseline" wrap={false}>
                      <span style={{ color: settings.textColor, fontSize: 44, fontWeight: 700, lineHeight: 1 }}>4.7</span>
                      <Text as="p" tone="subdued">out of 5</Text>
                    </InlineStack>
                  ) : null}
                  {settings.showAverageRating ? (
                    <span
                      style={{
                        display: "inline-flex",
                        width: "fit-content",
                        borderRadius: settings.ratingBadgeBorderRadius,
                        background: settings.ratingBadgeBackgroundColor,
                        padding: settings.ratingBadgePadding
                      }}
                    >
                      <StarRating rating={4.7} settings={settings} />
                    </span>
                  ) : null}
                  {settings.showReviewCount ? <Text as="p" tone="subdued">238 total reviews</Text> : null}
                </BlockStack>

                {settings.showRatingBreakdown ? (
                  <BlockStack gap="150">
                    {breakdown.map((item) => {
                      const percent = Math.round((item.count / totalBreakdown) * 100);
                      return (
                        <InlineStack key={item.rating} gap="400" blockAlign="center" wrap={false}>
                          <label style={{ alignItems: "center", color: settings.textColor, display: "inline-flex", fontWeight: 650, gap: 8, width: 90 }}>
                            <input type="checkbox" checked={reviewFilter === `${item.rating}_star`} onChange={(event) => setReviewFilter(event.currentTarget.checked ? `${item.rating}_star` : "most_recent")} />
                            <span>{item.rating}-star</span>
                          </label>
                          <span style={{ flex: 1, height: 8, borderRadius: 999, background: "#eef0f2", overflow: "hidden" }}>
                            <span style={{ display: "block", width: `${percent}%`, height: "100%", background: settings.ratingBarColor }} />
                          </span>
                          <span style={{ width: 44, color: settings.lighterTextColor, textAlign: "right" }}>{percent}%</span>
                        </InlineStack>
                      );
                    })}
                  </BlockStack>
                ) : null}
              </div>

              {settings.showAiSummary ? (
                <div style={{ ...reviewCardStyle, background: "#f7faf9" }}>
                  <Text as="p" variant="headingSm">
                    <span style={{ fontSize: 16 }}>AI review summary</span>
                  </Text>
                  <Text as="p" tone="subdued">Customers frequently highlight sturdy materials, comfortable finishes, careful delivery coordination, and responsive support before and after purchase. Recent reviews suggest shoppers value clear communication, accurate product details, and furniture that feels consistent with the photos and samples.</Text>
                  <Text as="p" tone="subdued">*AI-powered review summary based on recent customer reviews</Text>
                </div>
              ) : null}

              {settings.showReviewHighlights ? (
                <InlineStack gap="200">
                  {["Easy assembly", "Quality fabric", "Helpful support"].map((label) => (
                    <span key={label} style={{ border: `1px solid ${settings.borderColor}`, borderRadius: 999, padding: "6px 10px", color: settings.lighterTextColor }}>
                      {label}
                    </span>
                  ))}
                </InlineStack>
              ) : null}

              {settings.showPhotoSummary && previewPhotos.length ? (
                <PreviewPhotoSummary photos={previewPhotos} settings={settings} onOpen={setPreviewImage} />
              ) : null}

              {settings.layoutType === "carousel" && settings.carouselShowArrows ? (
                <InlineStack align="end" gap="200">
                  <Button>‹</Button>
                  <Button>›</Button>
                </InlineStack>
              ) : null}

              <div style={{ alignItems: "center", borderBottom: `1px solid ${settings.borderColor}`, display: "flex", gap: 16, justifyContent: "space-between", marginTop: 8 }}>
                <div style={{ display: "flex", gap: 22 }}>
                  <PreviewTab active={activeTab === "reviews"} settings={settings} onClick={() => setActiveTab("reviews")}>
                    Reviews (238)
                  </PreviewTab>
                  <PreviewTab active={activeTab === "questions"} settings={settings} onClick={() => setActiveTab("questions")}>
                    Questions ({previewQuestions.length})
                  </PreviewTab>
                </div>
                <div style={{ marginBottom: 8, width: 220 }}>
                  <Select
                    label="Sort reviews"
                    labelHidden
                    options={reviewSortOptions}
                    value={reviewFilter}
                    onChange={setReviewFilter}
                  />
                </div>
              </div>

              {activeTab === "reviews" ? (
                <>
                  <div style={previewListStyle(settings)}>
                    {previewReviews.map((review) => (
                      <div key={review.title} style={reviewCardStyle}>
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            {settings.showReviewerPhotos ? <InitialsAvatar name={review.name} settings={settings} /> : null}
                            <Text as="p" tone="subdued">{review.name}{settings.hideReviewDate ? "" : ` · ${review.date}`}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <StarRating rating={review.rating} settings={settings} />
                            {settings.showVerifiedBadge && review.verified ? <Badge tone="success">Verified</Badge> : null}
                          </InlineStack>
                          <Text as="h3" variant="headingSm">
                            <span style={{ color: settings.titleTextColor, fontSize: settings.titleFontSize }}>{review.title}</span>
                          </Text>
                          <Text as="p">
                            <span style={{ color: settings.contentTextColor, fontSize: settings.contentFontSize }}>{review.content}</span>
                          </Text>
                          {review.imageUrl ? (
                            <button type="button" onClick={() => setPreviewImage(review.imageUrl)} style={{ background: "transparent", border: 0, cursor: "pointer", padding: 0, width: "fit-content" }}>
                              <img src={review.imageUrl} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: settings.borderRadius }} />
                            </button>
                          ) : null}
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="span" tone="subdued">Helpful?</Text>
                            <button type="button" style={{ alignItems: "center", background: "transparent", border: 0, color: settings.buttonBackgroundColor, cursor: "pointer", display: "inline-flex", gap: 5, padding: 0 }}>
                              <UsefulOutlineIcon />
                              <span>3</span>
                            </button>
                            <button type="button" style={{ alignItems: "center", background: "transparent", border: 0, color: settings.lighterTextColor, display: "inline-flex", gap: 5, padding: 0 }}>
                              <ThumbDownIcon />
                              <span>0</span>
                            </button>
                          </InlineStack>
                        </BlockStack>
                      </div>
                    ))}
                    {previewReviews.length === 0 ? <Text as="p" tone="subdued">No reviews match this filter.</Text> : null}
                  </div>
                  {settings.layoutType === "carousel" && settings.carouselShowDots ? (
                    <InlineStack align="center" gap="200">
                      {[0, 1, 2].map((dot) => (
                        <span key={dot} style={{ width: 8, height: 8, borderRadius: 999, background: dot === 0 ? settings.buttonBackgroundColor : settings.borderColor }} />
                      ))}
                    </InlineStack>
                  ) : null}
                </>
              ) : (
                <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
                  <Text as="h3" variant="headingMd">Customer questions</Text>
                  {previewQuestions.length ? (
                    previewQuestions.map((question) => (
                      <div key={question.question} style={reviewCardStyle}>
                        <BlockStack gap="150">
                          <Text as="p" tone="subdued">{question.customerName} · {question.createdAt}</Text>
                          <Text as="p"><strong>Q:</strong> {question.question}</Text>
                          <Text as="p" tone="subdued"><strong>A:</strong> {question.answer}</Text>
                        </BlockStack>
                      </div>
                    ))
                  ) : (
                    <div style={{ ...reviewCardStyle, borderStyle: "dashed" }}>
                      <BlockStack gap="200">
                        <Text as="p" tone="subdued">No questions yet.</Text>
                        {settings.showAskQuestionButton ? <PreviewButton settings={settings} onClick={() => setQuestionOpen(true)}>Ask a question</PreviewButton> : null}
                      </BlockStack>
                    </div>
                  )}
                </div>
              )}
            </BlockStack>
          </div>
          {questionOpen ? (
            <div style={{ border: `1px solid ${settings.borderColor}`, borderRadius: settings.borderRadius, padding: 16, background: settings.cardBackgroundColor }}>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingMd">Ask a question</Text>
                  <Button onClick={() => setQuestionOpen(false)}>Cancel</Button>
                </InlineStack>
                {questionSent ? (
                  <Text as="p">Thanks for your question.</Text>
                ) : (
                  <>
                    <TextField label="Name" autoComplete="name" />
                    <TextField label="Email" type="email" autoComplete="email" />
                    <TextField label="Question" multiline={4} autoComplete="off" />
                    <Button variant="primary" onClick={() => setQuestionSent(true)}>Submit</Button>
                  </>
                )}
              </BlockStack>
            </div>
          ) : null}
          {previewImage ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Review photo preview"
              onClick={() => setPreviewImage("")}
              style={{
                alignItems: "center",
                background: "rgba(0, 0, 0, 0.55)",
                display: "flex",
                inset: 0,
                justifyContent: "center",
                padding: 24,
                position: "fixed",
                zIndex: 620
              }}
            >
              <div onClick={(event) => event.stopPropagation()} style={{ background: "#fff", borderRadius: 12, maxWidth: "min(760px, calc(100vw - 48px))", padding: 14, position: "relative" }}>
                <button type="button" aria-label="Close photo preview" onClick={() => setPreviewImage("")} style={{ background: "#fff", border: `1px solid ${settings.borderColor}`, borderRadius: 999, cursor: "pointer", height: 32, position: "absolute", right: 18, top: 18, width: 32 }}>×</button>
                {previewPhotoUrls.length > 1 ? (
                  <>
                    <button type="button" aria-label="Previous photo" onClick={() => setPreviewImage(nextPreviewImage(previewPhotoUrls, previewImage, -1))} style={previewImageArrowStyle("left", settings)}>‹</button>
                    <button type="button" aria-label="Next photo" onClick={() => setPreviewImage(nextPreviewImage(previewPhotoUrls, previewImage, 1))} style={previewImageArrowStyle("right", settings)}>›</button>
                  </>
                ) : null}
                <img src={previewImage} alt="" style={{ borderRadius: 8, display: "block", maxHeight: "calc(100vh - 140px)", maxWidth: "100%", objectFit: "contain" }} />
              </div>
            </div>
          ) : null}
        </BlockStack>
      </Card>
    </div>
  );
}

function PreviewPhotoSummary({
  photos,
  settings,
  onOpen
}: {
  photos: Array<{ imageUrl: string; title: string }>;
  settings: WidgetSettings;
  onOpen: (imageUrl: string) => void;
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const visibleCount = Math.max(4, Math.min(20, Number(settings.photoSummaryLimit) || 8));
  const scroll = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * Math.max(180, Math.round(track.clientWidth * 0.75)), behavior: "smooth" });
  };

  return (
    <div style={{ margin: "4px 0 2px", position: "relative" }}>
      <div
        ref={trackRef}
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          padding: photos.length > visibleCount ? "2px 44px 8px" : "2px 0 8px",
          scrollSnapType: "x proximity"
        }}
      >
        {photos.map((photo) => (
          <button
            key={photo.imageUrl}
            type="button"
            onClick={() => onOpen(photo.imageUrl)}
            aria-label={`Open review photo: ${photo.title}`}
            style={{
              background: "transparent",
              border: 0,
              borderRadius: settings.borderRadius,
              cursor: "pointer",
              aspectRatio: "1 / 1",
              flex: `0 0 max(64px, calc((100% - ${(visibleCount - 1) * 10}px) / ${visibleCount}))`,
              overflow: "hidden",
              padding: 0,
              scrollSnapAlign: "start"
            }}
          >
            <img
              src={photo.imageUrl}
              alt=""
              style={{ display: "block", height: "100%", objectFit: "cover", width: "100%" }}
            />
          </button>
        ))}
      </div>
      {photos.length > visibleCount ? (
        <>
        <button
          type="button"
          aria-label="Previous review photos"
          onClick={() => scroll(-1)}
          style={{
            alignItems: "center",
            background: "#fff",
            border: `1px solid ${settings.borderColor}`,
            borderRadius: 999,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
            display: "inline-flex",
            fontSize: 24,
            height: 34,
            justifyContent: "center",
            position: "absolute",
            left: 4,
            top: "50%",
            transform: "translateY(-50%)",
            width: 34
          }}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Next review photos"
          onClick={() => scroll(1)}
          style={{
            alignItems: "center",
            background: "#fff",
            border: `1px solid ${settings.borderColor}`,
            borderRadius: 999,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
            cursor: "pointer",
            display: "inline-flex",
            fontSize: 24,
            height: 34,
            justifyContent: "center",
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)",
            width: 34
          }}
        >
          ›
        </button>
        </>
      ) : null}
    </div>
  );
}

function nextPreviewImage(images: string[], currentImage: string, direction: -1 | 1) {
  if (!images.length) return currentImage;
  const currentIndex = Math.max(0, images.indexOf(currentImage));
  return images[(currentIndex + direction + images.length) % images.length];
}

function previewImageArrowStyle(position: "left" | "right", settings: WidgetSettings): React.CSSProperties {
  return {
    alignItems: "center",
    background: "#fff",
    border: `1px solid ${settings.borderColor}`,
    borderRadius: 999,
    boxShadow: "0 6px 18px rgba(0, 0, 0, 0.18)",
    cursor: "pointer",
    display: "inline-flex",
    fontSize: 28,
    height: 40,
    justifyContent: "center",
    [position]: 16,
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 40
  };
}

function PreviewTab({ active, settings, children, onClick }: { active: boolean; settings: WidgetSettings; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        border: 0,
        borderBottom: `3px solid ${active ? settings.buttonBackgroundColor : "transparent"}`,
        color: active ? settings.textColor : settings.lighterTextColor,
        cursor: "pointer",
        font: "inherit",
        fontWeight: 650,
        padding: "0 0 12px"
      }}
    >
      {children}
    </button>
  );
}

const reviewSortOptions = [
  { label: "Most recent", value: "most_recent" },
  { label: "Highest rating", value: "highest_rating" },
  { label: "Lowest rating", value: "lowest_rating" },
  { label: "Only pictures", value: "only_pictures" },
  { label: "Pictures first", value: "pictures_first" }
];

function sortPreviewReviews<Review extends { rating: number; imageUrl: string }>(reviews: Review[], filter: string) {
  const nextReviews = filter === "only_pictures"
    ? reviews.filter((review) => review.imageUrl)
    : [...reviews];

  if (filter === "highest_rating") return nextReviews.sort((a, b) => b.rating - a.rating);
  if (filter === "lowest_rating") return nextReviews.sort((a, b) => a.rating - b.rating);
  if (filter === "pictures_first") return nextReviews.sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)));
  if (/^[1-5]_star$/.test(filter)) {
    const rating = Number(filter.charAt(0));
    return nextReviews.filter((review) => Math.round(review.rating) === rating);
  }
  return nextReviews;
}

function previewListStyle(settings: WidgetSettings): React.CSSProperties {
  if (settings.layoutType === "cards") {
    return {
      display: "grid",
      gridTemplateColumns: `repeat(${Math.max(2, Math.min(4, Number(settings.reviewsPerRow) || 3))}, minmax(0, 1fr))`,
      gap: settings.reviewCardSpacing
    };
  }

  if (settings.layoutType === "carousel") {
    return {
      display: "grid",
      gridAutoFlow: "column",
      gridAutoColumns: `calc((100% - ${(settings.carouselCardsPerRow - 1) * settings.reviewCardSpacing}px) / ${settings.carouselCardsPerRow})`,
      gap: settings.reviewCardSpacing,
      overflowX: "auto",
      scrollSnapType: "x mandatory",
      paddingBottom: 8
    };
  }

  return { display: "grid", gap: settings.reviewCardSpacing };
}

function StarRating({ rating, settings }: { rating: number; settings: WidgetSettings }) {
  const normalizedRating = Math.max(0, Math.min(5, Number(rating) || 0));
  const emptyColor = "#d8dde3";
  return (
    <span style={{ display: "inline-flex", lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map((item) => {
        const fill = Math.max(0, Math.min(1, normalizedRating - (item - 1))) * 100;
        return (
          <span
            key={item}
            style={{
              alignItems: "center",
              background: "transparent",
              color: emptyColor,
              display: "inline-flex",
              height: settings.starSize,
              justifyContent: "center",
              lineHeight: 1,
              marginLeft: item === 1 ? 0 : settings.starGap,
              overflow: "hidden",
              position: "relative",
              width: settings.starSize
            }}
          >
            <RoundedStarIcon size={settings.starSize} />
            <span
              aria-hidden="true"
              style={{
                background: "transparent",
                color: settings.starColor,
                display: "block",
                inset: 0,
                overflow: "hidden",
                position: "absolute",
                width: `${fill}%`
              }}
            >
              <span
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  height: settings.starSize,
                  justifyContent: "center",
                  width: settings.starSize
                }}
              >
                <RoundedStarIcon size={settings.starSize} />
              </span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

function RoundedStarIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flex: "0 0 auto" }}>
      <path
        fill="currentColor"
        d="M12 3.1c.35 0 .66.2.82.52l1.9 3.83c.14.29.42.49.74.54l4.23.61c.35.05.64.29.75.62.11.34.02.7-.23.95l-3.06 2.98c-.23.22-.33.55-.28.86l.72 4.21c.06.35-.08.7-.37.91-.28.21-.66.23-.97.07l-3.78-1.99a1.02 1.02 0 0 0-.94 0l-3.78 1.99c-.31.16-.69.14-.97-.07a.93.93 0 0 1-.37-.91l.72-4.21c.05-.31-.05-.64-.28-.86l-3.06-2.98a.91.91 0 0 1-.23-.95c.11-.33.4-.57.75-.62l4.23-.61c.32-.05.6-.25.74-.54l1.9-3.83c.16-.32.47-.52.82-.52Z"
      />
    </svg>
  );
}

function InitialsAvatar({ name, settings }: { name: string; settings: WidgetSettings }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      style={{
        alignItems: "center",
        background: settings.avatarBackgroundColor,
        borderRadius: 999,
        color: settings.avatarTextColor,
        display: "inline-flex",
        fontSize: 13,
        fontWeight: 600,
        height: settings.avatarSize,
        justifyContent: "center",
        width: settings.avatarSize
      }}
    >
      {initial}
    </span>
  );
}

function UsefulOutlineIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false" style={{ display: "block", fill: "none", height: 18, stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 1.8, width: 18 }}>
      <path d="M7.5 21H5.25A2.25 2.25 0 0 1 3 18.75v-6A2.25 2.25 0 0 1 5.25 10.5H7.5V21Z" />
      <path d="M7.5 10.5l4.2-7.2a1.8 1.8 0 0 1 3.35.9v4.05h3.55a2.4 2.4 0 0 1 2.35 2.9l-1.2 5.65A5.25 5.25 0 0 1 14.62 21H7.5V10.5Z" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false" style={{ display: "block", fill: "none", height: 18, stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 1.8, width: 18 }}>
      <path d="M7.5 3H5.25A2.25 2.25 0 0 0 3 5.25v6a2.25 2.25 0 0 0 2.25 2.25H7.5V3Z" />
      <path d="M7.5 13.5l4.2 7.2a1.8 1.8 0 0 0 3.35-.9v-4.05h3.55a2.4 2.4 0 0 0 2.35-2.9l-1.2-5.65A5.25 5.25 0 0 0 14.62 3H7.5v10.5Z" />
    </svg>
  );
}

function hexToHsb(hex: string) {
  const normalized = normalizeHex(hex);
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    brightness: max,
    alpha: 1
  };
}

function hsbToHex(color: { hue: number; saturation: number; brightness: number }) {
  const chroma = color.brightness * color.saturation;
  const huePrime = color.hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) [red, green, blue] = [chroma, x, 0];
  else if (huePrime < 2) [red, green, blue] = [x, chroma, 0];
  else if (huePrime < 3) [red, green, blue] = [0, chroma, x];
  else if (huePrime < 4) [red, green, blue] = [0, x, chroma];
  else if (huePrime < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  const match = color.brightness - chroma;
  return `#${[red, green, blue].map((value) => Math.round((value + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function normalizeHex(value: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value.slice(1).split("").map((char) => char + char).join("")}`;
  }
  return "#000000";
}

function PreviewButton({ settings, secondary, children, onClick }: { settings: WidgetSettings; secondary?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${secondary ? settings.borderColor : settings.buttonBackgroundColor}`,
        borderRadius: settings.borderRadius,
        background: secondary ? settings.cardBackgroundColor : settings.buttonBackgroundColor,
        color: secondary ? settings.textColor : settings.buttonTextColor,
        padding: "10px 14px",
        fontWeight: 600
      }}
    >
      {children}
    </button>
  );
}
