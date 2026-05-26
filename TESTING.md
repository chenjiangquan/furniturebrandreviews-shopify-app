# Testing Guide

This guide covers local validation, Shopify development store installation, Theme App Extension testing, product review moderation, and common troubleshooting.

## 1. Local Startup Checklist

Run these commands from the project root:

```bash
npm install
npm run setup
npm run dev
```

Expected results:

- `npm install` completes without blocking errors.
- `npm run setup` generates Prisma Client and initializes local SQLite at `prisma/dev.sqlite`.
- `npm run dev` starts Shopify CLI. If you are not logged in, it prints a device login code and an activation URL.
- After login, Shopify CLI connects the app to a development store, starts the Remix server, starts the Theme App Extension preview, and prints preview/install URLs.

Local verification already performed:

```bash
npm install
npm run setup
npm run typecheck
npx remix vite:build
```

Notes:

- The Remix build currently shows a Polaris CSS minify warning from upstream CSS, but the build succeeds.
- `npm run dev` requires Shopify CLI login and a valid Shopify app/dev store connection. A login prompt is not a code error.

## 2. Shopify App Configuration

Primary files:

- `shopify.app.toml`
- `shopify.web.toml`
- `extensions/fbr-theme-widgets/shopify.extension.toml`
- `.env`

### `shopify.app.toml`

Current important settings:

```toml
name = "Furniture Brand Reviews"
embedded = true

[build]
automatically_update_urls_on_dev = true

[access_scopes]
scopes = "read_products"

[webhooks]
api_version = "2025-10"

  [[webhooks.subscriptions]]
  topics = ["app/uninstalled"]
  uri = "/webhooks/app/uninstalled"

[app_proxy]
prefix = "apps"
subpath = "fbr"
```

The `client_id`, `application_url`, auth `redirect_urls`, `app_proxy.url`, and `dev_store_url` are placeholders until you connect the app through Shopify CLI or fill them from the Shopify Dev Dashboard.

For local dev, `automatically_update_urls_on_dev = true` lets Shopify CLI update app URLs to the current tunnel URL when `npm run dev` is running.

### Required Scopes

MVP scope:

```text
read_products
```

Do not add `read_orders` until verified-purchase checking is implemented with the Shopify Order API. The current MVP stores `verifiedPurchase` as a merchant-managed boolean and does not automatically verify orders.

### Redirect URLs

When `npm run dev` gives you a tunnel URL such as:

```text
https://your-current-shopify-cli-tunnel.example
```

Use these redirect URLs:

```text
https://your-current-shopify-cli-tunnel.example/auth/callback
https://your-current-shopify-cli-tunnel.example/auth/shopify/callback
https://your-current-shopify-cli-tunnel.example/api/auth/callback
```

Shopify CLI should update these automatically in dev mode if the app is linked and `automatically_update_urls_on_dev` is enabled.

### App URL

Use the tunnel root:

```text
https://your-current-shopify-cli-tunnel.example
```

### App Proxy

Use:

```text
Prefix: apps
Subpath: fbr
Proxy URL: https://your-current-shopify-cli-tunnel.example
```

Storefront blocks call the app proxy through:

```text
/apps/fbr
```

The app proxy forwards those storefront requests to the app backend during Shopify testing.

### Theme App Extension

The theme extension is configured at:

```text
extensions/fbr-theme-widgets/shopify.extension.toml
```

It contains:

- Product Star Rating
- Product Reviews Widget
- Write a Review Form
- Brand Review Carousel
- Company Trust Summary
- Floating Brand Trust Badge app embed

Do not edit Shopify theme files directly.

## 3. Create and Connect a Shopify Development App

Use the Shopify Dev Dashboard / Partner flow:

1. Go to `https://dev.shopify.com/dashboard`.
2. If entering through Partner Dashboard, open Partner Dashboard, choose App distribution, then visit Dev Dashboard.
3. Go to Apps.
4. Select Create app.
5. Choose the CLI/development app flow where available. If creating manually, name the app `Furniture Brand Reviews`.
6. Copy the Client ID and Client secret into `.env`:

   ```bash
   SHOPIFY_API_KEY=your_client_id
   SHOPIFY_API_SECRET=your_client_secret
   SCOPES=read_products
   ```

7. Create or choose a development store from the Dev Dashboard.
8. Update `shopify.app.toml`:

   ```toml
   client_id = "your_client_id"

   [build]
   dev_store_url = "your-dev-store.myshopify.com"
   ```

9. Run:

   ```bash
   npm run dev
   ```

10. If prompted, complete Shopify CLI login using the device code URL printed in the terminal.
11. Follow the CLI prompts to link this local project to the Shopify app and development store.

## 4. Install and Verify OAuth

After `npm run dev` finishes starting, Shopify CLI should print a preview/install URL.

Open the install URL and complete app installation in the development store.

OAuth is successful when:

- The app opens embedded inside Shopify Admin.
- The Dashboard page loads instead of redirecting repeatedly.
- The local terminal shows requests to `/auth/...` and `/app`.
- `prisma/dev.sqlite` contains a `Session` row for the shop.
- `Shop`, `WidgetSettings`, `ProductReviewSettings`, and `BrandWidgetData` rows are created for the shop after auth.

Optional local DB check:

```bash
DATABASE_URL=file:./dev.sqlite node -e 'const {PrismaClient}=require("@prisma/client"); const p=new PrismaClient(); Promise.all([p.session.count(),p.shop.count()]).then(([sessions,shops])=>console.log({sessions,shops})).finally(()=>p.$disconnect())'
```

## 5. Test Storefront APIs

With the app server running locally, test direct backend routes:

```bash
curl "http://localhost:3000/api/brand-widget-data?shop=your-dev-store.myshopify.com"
curl "http://localhost:3000/api/product-review-data?shop=your-dev-store.myshopify.com&productId=123"
curl "http://localhost:3000/api/product-reviews?shop=your-dev-store.myshopify.com&productId=123"
```

Submit a product review:

```bash
curl -X POST "http://localhost:3000/api/product-reviews" \
  -H "Content-Type: application/json" \
  -d '{
    "shop": "your-dev-store.myshopify.com",
    "productId": "123",
    "productHandle": "test-product",
    "productTitle": "Test Product",
    "customerName": "Local Tester",
    "customerEmail": "tester@example.com",
    "rating": 5,
    "title": "Great product",
    "content": "This should be pending until approved."
  }'
```

Expected POST response:

```json
{
  "ok": true,
  "status": "PENDING",
  "message": "Review submitted and waiting for merchant approval."
}
```

After POST, repeat:

```bash
curl "http://localhost:3000/api/product-reviews?shop=your-dev-store.myshopify.com&productId=123"
```

Expected result: the pending review is not included in public storefront output until approved.

Verified locally:

- `GET /api/brand-widget-data`
- `GET /api/product-review-data`
- `GET /api/product-reviews`
- `POST /api/product-reviews`
- Pending reviews remain hidden from public GET output.

## 6. Test Theme App Extension in Development Store

Keep `npm run dev` running.

In Shopify Admin:

1. Go to Online Store.
2. Go to Themes.
3. Select Customize on the active development theme.

### Product Star Rating

1. Open a product template in Theme Editor.
2. Select Add block or Add section where the theme supports app blocks.
3. Choose Product Star Rating from Furniture Brand Reviews.
4. Save.
5. Confirm the block renders stars and review count for the current product.

### Product Reviews Widget

1. Stay on a product template.
2. Add Product Reviews Widget.
3. Save.
4. Confirm it shows average rating, review count, approved review list, and an empty state when there are no approved reviews.

### Write a Review Form

1. Stay on a product template.
2. Add Write a Review Form.
3. Save.
4. Open the storefront product page.
5. Submit name, email, rating, title, and content.
6. Confirm the success message says the review is waiting for approval.
7. Confirm the review does not immediately appear in Product Reviews Widget.

### Brand Review Carousel

1. Open any template where you want brand trust content.
2. Add Brand Review Carousel.
3. Save.
4. Confirm placeholder brand reviews render in a horizontal carousel.

### Company Trust Summary

1. Add Company Trust Summary.
2. Save.
3. Confirm it shows brand name, overall rating, total review count, AI summary, rating breakdown, and profile link.

### Floating Brand Trust Badge

1. In Theme Editor, open App embeds.
2. Enable Floating Brand Trust Badge.
3. Save.
4. Open the storefront.
5. Confirm the badge appears in the configured bottom corner.
6. Click it and confirm it opens the FurnitureBrandReviews profile URL.

## 7. Product Review Moderation Flow

1. Submit a storefront review from Write a Review Form.
2. Open the embedded app in Shopify Admin.
3. Go to Product Reviews.
4. Confirm the new review appears with `PENDING`.
5. Click Approve.
6. Reopen the product page.
7. Confirm Product Star Rating and Product Reviews Widget now include that review.
8. Submit another review.
9. Click Reject.
10. Confirm rejected reviews do not appear on the storefront.
11. Test Delete only with disposable test reviews.

## 8. Admin Pages to Check

### Dashboard

Confirm:

- Total product reviews
- Pending reviews
- Approved reviews
- Average product rating
- Brand widget status

### Product Reviews

Confirm:

- Review list renders.
- Product filter works.
- Status filter works.
- Approve works.
- Reject works.
- Delete works.
- Manual add works.
- Edit review works.
- Verified purchase can be toggled manually.

### Brand Widgets

Confirm:

- Carousel preview renders.
- Company trust summary preview renders.
- Floating badge preview renders.

### Settings

Confirm:

- Brand settings save.
- Product review settings save.
- Design settings save.
- Storefront widgets reflect design settings after refresh where applicable.

## 9. Common Errors

### Shopify CLI asks for a device login code

This is expected on first run.

Open the activation URL printed by `npm run dev`, enter the code, and log in with the Shopify account that has access to the app and development store.

### `client_id` is still `replace-with-shopify-client-id`

Update `shopify.app.toml` and `.env` with the Client ID from the Shopify Dev Dashboard.

### App redirects loop during install

Check:

- `SHOPIFY_API_KEY` matches `client_id`.
- `SHOPIFY_API_SECRET` matches the app's Client secret.
- App URL is the current tunnel root.
- Redirect URLs use the current tunnel root and include `/auth/callback`.
- Cookies are not blocked in the browser.

### Theme app blocks do not appear

Check:

- `npm run dev` is still running.
- The app is installed on the same development store.
- The theme supports Online Store 2.0 app blocks.
- You are editing the correct template.
- The extension was included in the CLI dev session.

### Floating badge does not appear

Check:

- It is enabled under Theme Editor > App embeds.
- The theme was saved after enabling it.
- Browser console has no request errors for `/apps/fbr/api/brand-widget-data`.

### Storefront widget API requests fail

Check:

- App proxy is configured as `/apps/fbr`.
- `app_proxy.url` points to the current tunnel root.
- The app server is running.
- The `shop` parameter is the permanent myshopify domain.

### Product review submits but does not show immediately

This is expected. Storefront submissions are always `PENDING` and remain hidden until approved in Admin > Product Reviews.

### `read_orders` is needed later

Do not add it for the MVP. Add `read_orders` only when verified-purchase validation through Shopify orders is implemented and you are ready to request any required protected data access.

## 10. Useful Shopify Docs

- Shopify CLI app dev: https://shopify.dev/docs/api/shopify-cli/app/app-dev
- Shopify CLI app commands: https://shopify.dev/docs/api/shopify-cli/app
- Dev Dashboard: https://shopify.dev/docs/apps/build/dev-dashboard
- Development stores: https://shopify.dev/docs/apps/build/dev-dashboard/development-stores
- Theme app extensions: https://shopify.dev/docs/apps/online-store/theme-app-extensions
- Theme app extension configuration: https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration
