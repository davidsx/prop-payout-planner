# Prop Payout Planner

A Next.js app that turns a set of prop-firm evaluation plans into **daily profit
targets** and a **calendar of progress and take-home payouts**.

## What it does

You enter a row per account configuration with these fields (matching the
planning spreadsheet):

| Field | Meaning |
| --- | --- |
| Prop firm / Size | Label for the account (e.g. `Tradeify Select` / `50k`) |
| Count | Number of payouts expected from this config |
| Payout | Gross payout amount per payout |
| Rate | Take-home rate applied to gross (default `0.9` = 90%) |
| Min day | Daily minimum profit floor |
| Eval / 1st / Remaining target | Profit target for each phase |
| Eval / 1st / Remaining days | Trading days budgeted for each phase |

Derived automatically:

- **Daily target** for a phase = `max(target ÷ days, min day)`.
- **Take-home** for an account = `count × payout × rate`.
- **Total take-home** = sum across all accounts.

With the sample data the totals are **$3,600 + $9,000 + $9,000 + $22,500 =
$44,100**.

## Calendar model

- All accounts run **in parallel** from a single **start date** (defaults to
  today; editable).
- Only **trading days** advance a phase — Mon–Fri by default (Sun–Fri or every
  day are selectable).
- Each phase spans its budgeted number of trading days: `Eval → 1st → Remaining`.
- Each active day shows the **combined daily target** across all accounts and a
  colored dot per account/phase.
- **Payout days** are highlighted with a 💰 pill: the first payout lands on the
  last day of the *1st target* phase, and the remaining `count − 1` payouts are
  spread evenly across the *Remaining* phase.
- Click any active day for a per-account breakdown.

## Storage & cloud sync

By default the plan is saved to your browser's `localStorage`. Optionally it
also syncs to **Upstash Redis** (what Vercel KV now is) so you can open the same
plan on another device.

- Each plan lives in an unguessable **"space"** carried in the URL
  (`?space=ab12cd34`). There's no login — whoever has the link can view/edit that
  space, so treat the link like a password.
- The **Sync space** field + **Copy sync link** button are in the toolbar. Open
  the copied link on another device to load the same plan.
- The status pill shows **Synced / Saving / Local only / Sync error**. Writes are
  debounced (~0.7s); `localStorage` is always the instant local cache, so it
  works offline and falls back gracefully when no backend is configured.

Data flow: `localStorage` (instant) → `PUT /api/plan?space=…` → Redis key
`plan:<space>`. On load, the server copy wins if present.

## Run it

```bash
cd prop-payout-planner
npm install
npm run dev            # http://localhost:3000  (local-only unless env vars set)
```

To sync locally too, create `.env.local` (see `.env.local.example`) with
`KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN`).

Build for production:

```bash
npm run build && npm start
```

## Deploy to Vercel

This app lives in a **subdirectory** of the repo, so set the project's **Root
Directory** to `prop-payout-planner`.

**Dashboard route (simplest):**
1. Push the repo to GitHub, then in Vercel: **Add New → Project**, import the
   repo, and set **Root Directory = `prop-payout-planner`**. Framework auto-detects
   as Next.js.
2. Add the Redis store: **Storage → Create Database → Upstash for Redis** (Marketplace),
   then **Connect** it to this project. Vercel injects `KV_REST_API_URL` /
   `KV_REST_API_TOKEN` automatically.
3. **Deploy.** Redeploy once after connecting the store so the env vars are picked up.

**CLI route:**
```bash
npm i -g vercel
cd prop-payout-planner
vercel                 # link/create the project (interactive login)
# add the Upstash store in the dashboard, then:
vercel env pull        # pulls KV_* into .env.local for local dev
vercel --prod          # production deploy
```
In this session, run interactive commands with a leading `!` (e.g. `! vercel login`)
so their output lands in the conversation.

Without the Redis env vars the deploy still works — it just runs local-only per
browser.
