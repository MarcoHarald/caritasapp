# CaritasApp

Owner-only charity shop ledger web app connected to Supabase.

## MVP scope implemented

- Google sign in via Supabase Auth
- Email/password sign in fallback
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

4. Create a Supabase project and apply migrations:

- Run SQL files from:
  - `supabase/migrations/`

5. In Supabase Auth:

- Enable Google provider
- Add your app callback URL:
  - `http://localhost:3000/auth/callback` (dev)
  - `https://*-3000.app.github.dev/auth/callback` (GitHub Codespaces preview)
  - your production URL `/auth/callback` (prod)
- Keep Email provider enabled for fallback sign in

6. Start the app:

```bash
npm run dev
```

## Troubleshooting

### Tailwind oxide native binding missing

If you see an error like `Cannot find module '@tailwindcss/oxide-linux-x64-gnu'`:

- run `npm install` again
- if needed, delete `node_modules` and reinstall

This repository also includes:

- `.npmrc` with `include=optional`
- an automatic preflight script (`scripts/ensure-tailwind-oxide.js`) that repairs missing Tailwind oxide native bindings before `npm run dev` and `npm run build` on Linux x64.

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
