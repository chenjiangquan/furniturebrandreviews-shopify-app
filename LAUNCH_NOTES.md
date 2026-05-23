# Launch Notes

## Production App

- Railway production URL: https://furniturebrandreviews-shopify-app-production.up.railway.app
- Shopify app distribution: Public App - Unlisted
- Embedded app: enabled
- App proxy: `/apps/fbr`
- Theme App Extension: `extensions/fbr-theme-widgets`

## Required Environment Variables

Backend:

```bash
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=https://furniturebrandreviews-shopify-app-production.up.railway.app
SCOPES=read_products,read_themes
DATABASE_URL=
```

Email notifications:

```bash
RESEND_API_KEY=
NOTIFICATION_FROM_EMAIL=
```

## Database

Production uses PostgreSQL on Railway with:

```bash
prisma/schema.postgresql.prisma
```

Railway build command:

```bash
npm install && npx prisma generate --schema prisma/schema.postgresql.prisma && npm run build
```

Railway start command:

```bash
npx prisma migrate deploy --schema prisma/schema.postgresql.prisma && npm run start
```

Local development can continue to use SQLite with:

```bash
prisma/schema.prisma
npm run setup
```

## Shopify App URLs

Set these in Shopify Partner Dashboard / app configuration:

- App URL: `https://furniturebrandreviews-shopify-app-production.up.railway.app`
- Allowed redirection URL: `https://furniturebrandreviews-shopify-app-production.up.railway.app/auth/callback`
- Allowed redirection URL: `https://furniturebrandreviews-shopify-app-production.up.railway.app/auth/shopify/callback`
- Allowed redirection URL: `https://furniturebrandreviews-shopify-app-production.up.railway.app/api/auth/callback`
- App proxy URL: `https://furniturebrandreviews-shopify-app-production.up.railway.app`
- App proxy prefix/subpath: `/apps/fbr`

Listing URLs:

- Privacy policy: https://www.furniturebrandreviews.com/privacy-policy
- Terms of service: https://www.furniturebrandreviews.com/terms-of-service
- Contact: https://www.furniturebrandreviews.com/contact

## Deploy Backend

1. Commit and push to `main`.
2. Railway deploys from GitHub.
3. Confirm the active Railway deployment uses the latest commit.
4. Confirm migrations run successfully with `prisma/schema.postgresql.prisma`.

## Deploy Theme App Extension

Run:

```bash
npx shopify app deploy --allow-updates
```

This creates and releases a new Shopify app version that includes the Theme App Extension. Run this whenever Liquid blocks, extension assets, app proxy settings, webhook subscriptions, or app configuration change.

## Release New Shopify App Version

1. Run `npx shopify app deploy --allow-updates`.
2. Confirm the CLI says a new version was released.
3. Open the Shopify Dev Dashboard version URL printed by the CLI.
4. Confirm the latest version includes:
   - Theme App Extension
   - App proxy configuration
   - Mandatory GDPR webhooks
5. Reinstall or update the app on the development store if Shopify prompts for new permissions/configuration.

## Production Error Handling

Production UI should show friendly messages to merchants. Detailed operational errors should be logged with `console.error` in Railway logs. Do not show development-only instructions such as local setup commands, local URLs, or temporary tunnel URLs in production app screens.
