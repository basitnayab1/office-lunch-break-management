# Office Lunch Break Management System

Production-ready Next.js application for tracking employee lunch/break times, with Supabase (database + auth + RLS) and automatic Google Sheets synchronization.

## Features

- **Employee**: select name + PIN login, start/end break, live countdown based on server timestamps, personal history
- **Admin**: live dashboard, employee management, break history, daily/monthly reports, CSV export, Google Sheets settings
- **Integrity**: one active break per employee, refresh/multi-device safe, overtime tracking until manual end
- **Google Sheets**: server-side sync, conditional formatting for overtime, pending/failed retry

## Tech stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- Supabase (Postgres, Auth, RLS, Realtime)
- Google Sheets API (service account)
- Vercel-ready

## Quick start

### 1. Prerequisites

- Node.js 20+
- Supabase project
- Google Cloud project with Sheets API + service account (optional until you enable sync)

### 2. Install

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` using values from Supabase and Google Cloud.

### 3. Database

In the Supabase SQL Editor, run in order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_break_types.sql` (if you already applied `001` earlier)
3. `supabase/migrations/003_login_employees_only.sql` (if you already applied `001` earlier)
4. `supabase/migrations/004_admin_auth_profiles.sql` (admin Auth profile trigger + role security)
5. `supabase/migrations/005_fix_employee_create_triggers.sql` (harden Auth→employees create path)
6. `supabase/migrations/006_break_warning_settings.sql` (break warning alarm + optional test mode)

Enable **Realtime** for `break_sessions` if the publication line did not apply automatically (Database → Replication).

### First admin account (production)

Passwords are stored only in **Supabase Auth** (hashed). Roles live on `public.employees` (this project’s profile table — do **not** create a separate `profiles` table).

1. Apply migration `004_admin_auth_profiles.sql`.
2. In Supabase Dashboard → **Authentication → Users → Add user**:
   - Enter the admin **email** and a strong **password**
   - Confirm the email (or use “Auto Confirm”)
3. The Auth trigger creates an `employees` row with `role = 'employee'` by default.
4. Promote the user to admin (pick one):

**Option A — SQL Editor**

```sql
SELECT public.promote_user_to_admin(
  'admin@yourcompany.com',
  'Office Admin',
  'ADMIN01'
);
```

**Option B — CLI (service role)**

```bash
npm run promote-admin -- admin@yourcompany.com "Office Admin" ADMIN01
```

5. Sign in at `/admin/login` with that email + password.
6. Sign out from the Admin panel sidebar when finished.

New Auth users are **never** admins automatically. Only an explicit promote (SQL / service role / existing admin) sets `role = 'admin'`.

### 4. Seed demo users

```bash
npx tsx scripts/seed.ts
```

| Account | How to sign in | Credentials |
|---------|----------------|-------------|
| Office Admin | `/admin/login` email + password | `admin@office.local` / `AdminPass123!` (or `SEED_ADMIN_PASSWORD`) |
| Ali, Ahmed, Usman, Bilal, Hassan | `/` Name + PIN | PIN **`1234`** |

| Name | Role | Employee ID |
|------|------|-------------|
| Office Admin | admin | ADMIN01 |
| Ali | employee | EMP001 |
| Ahmed | employee | EMP002 |
| Usman | employee | EMP003 |
| Bilal | employee | EMP004 |
| Hassan | employee | EMP005 |

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

See `.env.example`.

| Variable | Where used | Notes |
|----------|------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Safe for browser with RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Never expose to the browser |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Server only | Service account `client_email` |
| `GOOGLE_PRIVATE_KEY` | Server only | Service account `private_key` (`\n` newlines, quoted) |
| `GOOGLE_SHEET_ID` | Server only | Spreadsheet ID from the sheet URL |
| `GOOGLE_SHEET_NAME` | Server only (optional) | Tab name; default `Break Records` |

## Google Sheets setup

### 1. Google Cloud

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable **Google Sheets API** (APIs & Services → Enable APIs).
4. Create a **Service Account** (IAM & Admin → Service Accounts).
5. Create a JSON key for that service account and download it.
6. **Do not commit** the JSON file. Store values in env vars only.

### 2. Local credentials (`.env.local`)

From the JSON key:

| JSON field | Env variable |
|------------|--------------|
| `client_email` | `GOOGLE_SERVICE_ACCOUNT_EMAIL` |
| `private_key` | `GOOGLE_PRIVATE_KEY` |

Also set:

```env
GOOGLE_SHEET_ID=your_spreadsheet_id_here
GOOGLE_SHEET_NAME=Break Records
```

`GOOGLE_SHEET_ID` is the segment between `/d/` and `/edit` in:

`https://docs.google.com/spreadsheets/d/<GOOGLE_SHEET_ID>/edit`

For `GOOGLE_PRIVATE_KEY`:

- Keep the surrounding double quotes
- Keep `\n` sequences (do not paste real multi-line breaks into `.env.local` unless your tooling supports them)

Example:

```env
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

### 3. Share the spreadsheet

Share your Google Sheet with the service account email as **Editor**.

Without this step, append/sync will fail with a permission error (the break still stays in Supabase as `failed` / `pending`).

### 4. Vercel credentials

In the Vercel project → **Settings → Environment Variables**, add the same server-only vars for Production (and Preview if needed):

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_NAME` (optional)

Notes for Vercel:

- Do **not** prefix these with `NEXT_PUBLIC_`
- Paste the private key as one line with `\n` escapes
- Redeploy after saving env vars

### 5. Verify connection

1. Sign in as **admin**
2. Open **Admin → Settings**
3. Click **Test connection**  
   or call `GET /api/google-sheets/test` while logged in as admin

### Sync behavior

On **End Break**:

1. Save completed break to Supabase (always)
2. Append row to Google Sheets via the server-side service
3. Apply/ensure conditional formatting:
   - **Extra Minutes > 0** → red highlight
   - **Status = Exceeded** → red highlight
4. If Sheets fails: keep the Supabase row, set `google_sheet_sync_status` to `failed`, allow **Retry** from History or Settings

Implementation lives in `src/lib/google-sheets/service.ts` (single client). Retry helpers are in `src/actions/breaks.ts`.

## Security model

- **Employees**: Name dropdown + PIN → Supabase Auth (`signInWithPassword` using the employee’s Auth email + PIN as password). PIN is never stored in plain text in the database.
- **Admins**: `/admin/login` with **email + password** via Supabase Auth. After login, `employees.role` must be `'admin'`.
- **Profiles / roles**: `public.employees` is the profile table (`id` → `auth.users`, `role` ∈ `employee` | `admin`). No duplicate `profiles` table.
- **Route protection**: middleware + server layouts/actions + RLS. Employees hitting `/admin` or `/api/admin/*` are denied.
- **RLS**:
  - Employees read/update only their own active break (end only)
  - Employees cannot edit completed records
  - Admins can manage employees, settings, and all breaks
  - Role changes are guarded (service role / postgres / existing admin only)
- Google credentials and service role key are server-only.

## Timezone & timestamps

- Stored in **UTC** in Postgres (`timestamptz`)
- Displayed using configurable office timezone (default **`Asia/Karachi`**)
- Countdown uses `started_at` + allowed minutes vs current time (aligned to server), not a fragile interval-only timer

## Project structure

```
src/
  actions/           # Server actions (auth, breaks, employees, reports, settings)
  app/               # App Router pages (login, dashboard, admin/*)
  components/        # UI + employee/admin components
  lib/
    breaks/          # Duration / overtime calculations
    google-sheets/   # Sheets API service
    supabase/        # Browser, server, service clients + middleware
    time/            # Timezone helpers
supabase/
  migrations/        # SQL schema + RLS
scripts/seed.ts      # Demo users
```

## Progressive Web App (PWA)

The app is installable as **Office Break Management** (short name: **Break Management**).

- Manifest: `src/app/manifest.ts`
- Service worker: `public/sw.js` (static shell only — never caches auth, PINs, Supabase data, or Sheets data)
- Install UI: floating **Install App** button when the browser supports it; iOS shows Share → Add to Home Screen help

Use HTTPS (or localhost) to install. After install, the app opens in standalone mode.

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Add the same environment variables.
4. Deploy.
5. Run the SQL migration + seed against your production Supabase project.
6. Share the Google Sheet with the service account.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run seed
npm run promote-admin -- admin@yourcompany.com "Office Admin" ADMIN01
```

## Manual test checklist

1. Employee login (name + PIN)
2. Start break
3. Countdown ticks / overtime display
4. Refresh during active break → still active
5. Close/reopen browser → still active
6. End break → history + status
7. Duplicate Start Break → rejected
8. Admin login (email + password) → `/admin`
9. Employee cannot open `/admin` (redirected)
10. Admin logout returns to `/admin/login`
11. Google Sheets row appears after end
12. Force Sheets failure → pending/failed + retry works
13. Extra minutes highlighted in Sheets
14. Timezone displays correctly
15. Mobile layout usable
16. `npm run build` / `npm run lint` clean
17. `GET /api/admin/session` succeeds only for admins
