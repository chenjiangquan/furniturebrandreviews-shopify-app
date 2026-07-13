# Supabase + Vercel Migration

This app can run on Vercel with Supabase PostgreSQL while keeping the public
Shopify app URL as:

```text
https://app.furniturebrandreviews.com
```

Keeping the same domain avoids changing the Shopify listing URL, app URL, and
merchant-facing install links.

## Target Architecture

```text
Shopify Admin / Storefront
  -> app.furniturebrandreviews.com
  -> Vercel Remix app
  -> Supabase PostgreSQL
```

Railway can be removed after Vercel is confirmed healthy.

## Supabase Database

Create a Supabase project and copy the PostgreSQL connection string.

Recommended:

- Use a pooled connection string for `DATABASE_URL` in Vercel.
- Use a direct connection string when running migrations locally.

This project currently keeps a single `DATABASE_URL` because Railway is still
supported. Run migrations manually with the Supabase direct connection string
before switching production traffic.

## Vercel Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

```bash
DATABASE_URL=
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=https://app.furniturebrandreviews.com
SCOPES=read_products,read_themes
SHOPIFY_APP_HANDLE=furniture-brand-reviews
RESEND_API_KEY=
NOTIFICATION_FROM_EMAIL=
APP_OWNER_NOTIFICATION_EMAIL=
```

If you use the free Pro shop whitelist, also set:

```bash
FREE_PRO_SHOPS=
```

Use comma-separated `.myshopify.com` domains.

## Vercel Build

`vercel.json` uses:

```bash
npm run build:vercel
```

That script runs:

```bash
prisma generate --schema prisma/schema.postgresql.prisma
remix vite:build
```

Do not run `prisma migrate deploy` from Vercel request handlers.

## Run Supabase Migrations

Before pointing `app.furniturebrandreviews.com` to Vercel, run:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate:prod
```

Use the Supabase direct database connection string for this command.

## Data Migration From Railway

If existing production data must be kept:

1. Export Railway PostgreSQL:

   ```bash
   pg_dump "$RAILWAY_DATABASE_URL" --format=custom --no-owner --no-acl --file=fbr-railway.dump
   ```

2. Restore into Supabase:

   ```bash
   pg_restore --clean --if-exists --no-owner --no-acl --dbname "$SUPABASE_DATABASE_URL" fbr-railway.dump
   ```

3. Run migrations after restore:

   ```bash
   DATABASE_URL="$SUPABASE_DATABASE_URL" npm run db:migrate:prod
   ```

If no production data needs to be kept, run migrations on an empty Supabase
database instead.

## DNS Cutover

After Vercel deployment is healthy:

1. Add `app.furniturebrandreviews.com` to Vercel Domains.
2. Update DNS records as Vercel instructs.
3. Wait for Vercel to show the domain as valid.
4. Confirm `https://app.furniturebrandreviews.com` opens the Vercel deployment.

## Shopify Configuration

No Shopify URL change is needed if the custom domain stays the same.

Confirm these remain:

- App URL: `https://app.furniturebrandreviews.com`
- Redirect URL: `https://app.furniturebrandreviews.com/auth/callback`
- Redirect URL: `https://app.furniturebrandreviews.com/auth/shopify/callback`
- App proxy URL: `https://app.furniturebrandreviews.com`

Run a Shopify app deploy only if app config or theme extension files change:

```bash
npx shopify app deploy
```

## Verification

After Vercel deploy and DNS cutover:

1. Open Shopify Admin -> Apps -> Furniture Brand Reviews.
2. Confirm Dashboard loads.
3. Confirm Product Reviews loads.
4. Save Widgets Settings.
5. Submit a storefront review.
6. Confirm review appears in admin.
7. Confirm email notification sends.
8. Confirm webhooks return 200 in Vercel logs.
9. Confirm Theme App Extension widgets still load storefront API data.

Only stop the Railway app service after these checks pass.
