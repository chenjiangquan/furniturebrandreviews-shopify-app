# Furniture Brand Reviews Shopify App

Standalone Shopify embedded app for product reviews and Furniture Brand Reviews trust widgets.

This project intentionally follows Shopify app architecture with a Remix backend, Polaris admin UI, Prisma database, and a Theme App Extension. It does not modify merchant theme files directly.

## Features

- Product review collection per Shopify product.
- Product star rating, product reviews widget, and write-a-review form as Theme App Extension blocks.
- Reviews submitted from storefront default to `PENDING`.
- Merchant moderation in the embedded admin app: approve, reject, delete, edit, and manually add reviews.
- Verified purchase field is stored as a boolean. The MVP does not claim verification automatically.
- Furniture brand review widgets: brand review carousel and compact micro trust badge.
- Widget settings for brand profile, AI summary display, rating breakdown display, design colors, radius, layout, autoplay, and badge position.
- Public storefront APIs for widgets and product reviews.

## Stack

- Shopify App Remix
- Shopify Polaris
- Prisma
- SQLite for local development
- Shopify Theme App Extension

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Fill in Shopify app credentials in `.env`.

4. Update `shopify.app.toml`:

   - `client_id`
   - `application_url`
   - `dev_store_url`
   - auth redirect URLs

5. Initialize the database:

   ```bash
   npm run setup
   ```

   The setup script generates Prisma Client and syncs local SQLite from `prisma/schema.prisma`.

6. Start Shopify development:

   ```bash
   npm run dev
   ```

## Storefront APIs

### `GET /api/product-reviews?shop=xxx&productId=xxx`

Returns only approved reviews:

```json
{
  "averageRating": 4.6,
  "reviewCount": 18,
  "reviews": []
}
```

### `POST /api/product-reviews`

Creates a new product review. Storefront submissions are always pending by default.

Required body:

```json
{
  "shop": "store.myshopify.com",
  "productId": "1234567890",
  "productHandle": "sofa",
  "productTitle": "Sofa",
  "customerName": "Customer",
  "customerEmail": "customer@example.com",
  "rating": 5,
  "title": "Great quality",
  "content": "The product arrived in good condition."
}
```

### `GET /api/brand-widget-data?shop=xxx`

Returns placeholder brand widget data for the MVP:

```json
{
  "brandName": "Weilai Concept",
  "rating": 4.7,
  "reviewCount": 238,
  "summary": "Customers often mention delivery, product quality and customer support.",
  "reviews": []
}
```

## Theme App Extension

Blocks:

- Product Star Rating
- Product Reviews Widget
- FBR Brand Review Carousel
- FBR Brand Micro Trust Badge

The app no longer injects a floating storefront trust badge by default. If an old `Floating Brand Trust Badge` block was added in a development theme, remove that block from the Theme Editor.

## Branding

The app favicon and in-app small icon use `public/branding/fbr-icon.png`.

Shopify Admin's left Apps list icon is controlled by Shopify app configuration, not Remix code. Upload the same icon in Shopify Partner Dashboard → App setup / App listing when preparing the app for review or distribution.

## Data Storage

Review data and MVP image storage behavior are documented in `DATA_STORAGE.md`. In short: product review records are stored in Prisma SQLite locally, and review images currently use the `imageUrl` field. Base64 image URLs are MVP-only; production should use Shopify Files, Cloudflare R2, S3, or Supabase Storage.

The storefront JavaScript defaults to the Shopify App Proxy base path `/apps/fbr`. The matching app proxy is declared in `shopify.app.toml`.

## Compliance Notes

- No fake review generation is included.
- Customer-submitted reviews are not publicly displayed until approved.
- AI is represented only as a configurable summary field.
- Verified purchase is a stored boolean for MVP moderation workflows. Automatic verification can be added later with Shopify Order API checks using customer email and product ID. Add `read_orders` only when that verification is implemented.
