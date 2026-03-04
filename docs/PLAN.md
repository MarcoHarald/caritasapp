# CaritasApp - Charity Shop Ledger Web App Plan

## 1) Product goal
Build a simple web app connected to Supabase so a charity shop owner can:
- Track volunteer hours
- Track daily cash movements in the shop
- Track manual bank account ledger entries (deposits and extractions)
- Attach receipt photos when needed
- Sign in with Google (via Supabase Auth)

Fixed MVP decisions:
- Supports multiple shops
- Currency is always `EUR`
- Default timezone is `Europe/Rome` (Italy)
- Access is owner-only per shop (no volunteer login/views for now)
- No reconciliation workflow in MVP

No direct bank API integration is required. The bank area is a manual ledger.

## 2) Suggested MVP stack
- Frontend: Next.js (App Router) + TypeScript
- UI: Tailwind CSS
- Backend: Supabase (Postgres, Auth, Storage, RLS)
- Forms/validation: React Hook Form + Zod
- Deployment: Vercel (frontend) + Supabase project

## 3) Access model (simplified)
- **Shop Owner (single role)**
  - User signs in with Google
  - User can create one or more shops
  - User has full access only to shops they created
  - No volunteer or accountant portal in MVP

## 4) Data model (MVP)

### `profiles`
Linked to `auth.users`.
- `id uuid` (PK, references auth user id)
- `full_name text`
- `email text`
- `created_at timestamptz`

### `shops`
Supports one or many shops per owner.
- `id uuid` (PK)
- `owner_user_id uuid` (FK -> profiles.id)
- `name text`
- `currency text` (default `'EUR'`)
- `timezone text` (default `'Europe/Rome'`)
- `created_at timestamptz`

### `volunteer_hours`
Owner records volunteer shifts manually.
- `id uuid` (PK)
- `shop_id uuid` (FK -> shops.id)
- `volunteer_name text`
- `work_date date`
- `start_time time`
- `end_time time`
- `hours numeric(5,2)` (auto-calculated from start/end)
- `notes text`
- `created_by uuid` (FK -> profiles.id)
- `created_at timestamptz`

### `cash_sessions`
One row per day (or shift) for opening/closing checks.
- `id uuid` (PK)
- `shop_id uuid` (FK -> shops.id)
- `session_date date`
- `opening_cash numeric(12,2)`
- `closing_cash_counted numeric(12,2)` (nullable until close)
- `notes text`
- `closed_by uuid` (nullable FK -> profiles.id)
- `closed_at timestamptz` (nullable)

### `cash_entries`
Every cash movement in the shop.
- `id uuid` (PK)
- `shop_id uuid` (FK -> shops.id)
- `cash_session_id uuid` (FK -> cash_sessions.id)
- `entry_date timestamptz`
- `type text` (`sale`, `expense`, `float_in`, `float_out`, `deposit_to_bank`, `adjustment`)
- `direction text` (`in`, `out`)
- `category text`
- `amount numeric(12,2)` (positive only)
- `description text`
- `created_by uuid` (FK -> profiles.id)
- `created_at timestamptz`

### `bank_ledger_entries`
Manual ledger for the real bank account.
- `id uuid` (PK)
- `shop_id uuid` (FK -> shops.id)
- `entry_date timestamptz`
- `type text` (`cash_deposit`, `withdrawal`, `bank_fee`, `adjustment`, `other`)
- `direction text` (`in`, `out`)
- `amount numeric(12,2)` (positive only)
- `reference text` (deposit slip id, note, etc.)
- `description text`
- `created_by uuid` (FK -> profiles.id)
- `created_at timestamptz`

### `receipts`
Metadata for uploaded images.
- `id uuid` (PK)
- `shop_id uuid` (FK -> shops.id)
- `entity_type text` (`cash_entry`, `bank_entry`)
- `entity_id uuid`
- `storage_path text`
- `uploaded_by uuid` (FK -> profiles.id)
- `created_at timestamptz`

## 5) Storage plan for receipt photos
- Supabase Storage bucket: `receipts`
- Path convention: `shop/{shop_id}/{entity_type}/{entity_id}/{timestamp}.jpg`
- Access policy: only the shop owner can upload/read for that shop
- Validate file type and max size in frontend and backend

## 6) Security and audit requirements
- Enable RLS on every app table
- Scope all data by `shop_id`
- Authorize rows through `shops.owner_user_id = auth.uid()`
- Add `created_by`, `created_at`, and optional `updated_at`
- Keep financial amounts positive and use `direction` for sign logic
- Prefer correction entries over destructive edits for finance history

## 7) Main screens (MVP)
1. **Sign in**
   - Google OAuth through Supabase Auth
2. **Shop selector**
   - Create new shop
   - Switch between owned shops
3. **Dashboard**
   - Today's cash in/out totals
   - Current cash session status
4. **Volunteer Hours**
   - Add volunteer shift entries
   - List/filter by date and volunteer name
5. **Cash Ledger**
   - Open/close daily session
   - Add cash entries
   - Running daily total
6. **Bank Ledger**
   - Add deposit/extraction entries
   - Filter by date/type
   - Running balance view
7. **Receipts**
   - Upload image for a cash or bank entry
   - Preview/download
8. **Reports**
   - CSV export for selected date ranges

## 8) Business rules to implement early
- Only one open `cash_session` per shop per day
- `end_time` must be after `start_time` for volunteer hours
- `hours` auto-calculated from start/end
- `amount > 0` for all finance entries
- No reconciliation process in MVP
- Corrections should be separate entries, not destructive edits

## 9) Delivery phases

### Phase 1 - Foundation
- Create Supabase project
- Configure Google OAuth provider
- Add SQL migrations for tables + indexes + owner-only RLS
- Enable multi-shop creation per user

### Phase 2 - Core workflows
- Build auth/session handling in Next.js
- Build Shop selector/create flow
- Build Volunteer Hours CRUD (owner-entered records)
- Build Cash Sessions + Cash Entries
- Build Bank Ledger Entries

### Phase 3 - Receipts and reporting
- Add receipt upload + linking
- Add dashboard summaries
- Add CSV exports

### Phase 4 - Hardening
- Validation and error handling
- Basic audit fields on all writes
- E2E smoke tests

## 10) Suggested initial backlog
- [ ] Set up Next.js app and Supabase client
- [ ] Create migration 001 (core tables with EUR + Europe/Rome defaults)
- [ ] Create migration 002 (owner-only RLS policies)
- [ ] Implement Google login flow
- [ ] Build shop create/switch page
- [ ] Build Volunteer Hours page
- [ ] Build Cash Ledger page
- [ ] Build Bank Ledger page
- [ ] Implement receipt uploads
- [ ] Add dashboard aggregates
- [ ] Add CSV export endpoints

## 11) Future options (not MVP)
- Add invite-based multi-user access per shop
- Add volunteer self-service login
- Add reconciliation and period lock if needed later

## 12) Definition of done for MVP
MVP is done when a shop owner can sign in with Google, create/manage multiple shops, record volunteer hours, record daily cash and bank ledger movements, attach receipts, and export data - with RLS ensuring only the owner can access each shop's data.
