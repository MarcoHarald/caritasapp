# CaritasApp

Owner-only charity shop ledger web app connected to Supabase.

## MVP scope implemented

- Google sign in via Supabase Auth
- Multi-shop support (one owner can manage multiple shops)
- Shop defaults:
  - Currency: `EUR`
  - Timezone default: `Europe/Rome`
- Volunteer hours tracking (owner-entered records)
- Daily cash sessions and cash entries
- Manual bank ledger entries (deposits/extractions/etc.)
- Receipt photo upload to Supabase Storage
- CSV exports for volunteer hours, cash entries, and bank entries

## Tech stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (`auth`, `postgres`, `storage`, `rls`)
- Vitest + Testing Library

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env.local
```

3. Set the values in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

4. Create a Supabase project and apply migration:

- Run SQL from:
  - `supabase/migrations/20260302183000_init_owner_only_schema.sql`

5. In Supabase Auth:

- Enable Google provider
- Add your app callback URL:
  - `http://localhost:3000/auth/callback` (dev)
  - your production URL `/auth/callback` (prod)

6. Start the app:

```bash
npm run dev
```

## Scripts

- `npm run dev` - development server
- `npm run lint` - lint code
- `npm run test:run` - run tests once
- `npm run build` - production build check

## Notes

- Data access is owner-only via RLS (no volunteer portal in MVP)
- No bank API integration; all bank movements are manually entered
- No reconciliation workflow in this version

## Planning doc

The project planning notes are in:

- `docs/PLAN.md`
