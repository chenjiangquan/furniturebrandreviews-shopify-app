# Production Prisma Migrations

Production uses PostgreSQL with `prisma/schema.postgresql.prisma`.

The current target hosting setup is Vercel + Supabase PostgreSQL.

Local development can continue to use SQLite with:

```bash
npm run setup
```

Production uses a PostgreSQL-only migration history:

```bash
npx prisma migrate deploy --schema prisma/schema.postgresql.prisma
```

The package script is:

```bash
npm run db:migrate:prod
```

The old SQLite migrations were replaced because they are not compatible with
Railway PostgreSQL. If Railway already has a failed migration record such as
`20260514194000_init`, create a fresh PostgreSQL database or clear the failed
database before redeploying. This project treats Railway as a new production
database for the PostgreSQL migration history.

Vercel build command:

```bash
npm run build:vercel
```

Legacy Railway build command:

```bash
npm install && npx prisma generate --schema prisma/schema.postgresql.prisma && npm run build
```

Legacy Railway start command:

```bash
npx prisma migrate deploy --schema prisma/schema.postgresql.prisma && npm run start
```

When using Supabase, run migrations manually with the Supabase direct database
connection string before pointing `app.furniturebrandreviews.com` to Vercel.
See `SUPABASE_VERCEL_MIGRATION.md`.
