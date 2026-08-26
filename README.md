# RJ Holidays Backend — Phases 5, 6, 7

This is the backend + admin panel covering:
- **Phase 5** — Smart Enquiry System (replaces the broken static form)
- **Phase 6** — CRM / Lead Management (single-user mode)
- **Phase 7** — Quotation System (with PDF generation and email delivery)

The pricing engine (Phase 4) is built in and used automatically inside the quote builder.

Your existing GitHub Pages site (`rjholidays.online`) is **not replaced**. This backend runs
separately on Render and talks to it via the enquiry form snippet and the admin panel / quote
pages, which are also hosted here.

---

## 1. Set up Supabase (database)

1. Go to [supabase.com](https://supabase.com) → New Project (free tier).
2. Once created, go to **SQL Editor** → New Query → paste the entire contents of `db/schema.sql` → Run.
3. Go to **Project Settings → API** and copy:
   - `Project URL` → this is your `SUPABASE_URL`
   - `service_role` key (NOT the `anon` key) → this is your `SUPABASE_SERVICE_ROLE_KEY`

   ⚠️ The service_role key is powerful — never put it in frontend code. It only goes into
   this backend's environment variables on Render.

## 2. Set up Resend (email)

1. Go to [resend.com](https://resend.com) → sign up (free tier: 100 emails/day, 3,000/month).
2. Add and verify your domain (`rjholidays.online`) under **Domains**, following their DNS
   instructions (you'll add a couple of DNS records in Hostinger).
3. Create an API Key → this is your `RESEND_API_KEY`.
4. Until domain verification completes, you can test with Resend's sandbox sender.

## 3. Generate your admin password hash

You'll log into the admin panel with an email + password, but the password is never stored
in plaintext. Run this once locally (or ask me and I'll generate it for you):

```js
node -e "console.log(require('bcryptjs').hashSync('YOUR_CHOSEN_PASSWORD', 10))"
```

Copy the output — this goes into `ADMIN_PASSWORD_HASH`.

## 4. Deploy to Render

1. Push this `rj-holidays-backend` folder to a new GitHub repo (e.g. `rjholidays-backend`).
2. Go to [render.com](https://render.com) → New → Web Service → connect that repo.
3. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. Under **Environment**, add all variables from `.env.example`:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`, `NOTIFY_EMAIL`, `FROM_EMAIL`
   - `JWT_SECRET` (any long random string)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`
   - `PUBLIC_BASE_URL` (set this to your Render URL once you know it, e.g. `https://rjholidays-backend.onrender.com`)
   - `FRONTEND_ORIGIN` (`https://www.rjholidays.online`)
5. Deploy. Render will give you a URL like `https://rjholidays-backend.onrender.com`.

Note: on Render's free tier, the service sleeps after inactivity and takes ~30-50 seconds to
wake up on the next request. Fine for admin use; if enquiry form responsiveness becomes an
issue, a paid tier (~$7/mo) removes this.

## 5. Connect the admin panel and quote page to your backend

Both `public/admin/index.html` and `public/quote/index.html` read `window.RJ_API_BASE`.
Once deployed, these are served directly by your backend at:
- `https://YOUR-RENDER-URL.onrender.com/admin`
- `https://YOUR-RENDER-URL.onrender.com/quote/:token` (used automatically in emailed quote links)

Edit the `API_BASE` constant near the top of each file's `<script>` block to your real Render
URL before your first deploy (or leave `window.RJ_API_BASE` unset and it'll fall back to that
same value — just make sure it's correct).

## 6. Connect the existing enquiry form on rjholidays.online

1. Open `website-integration/enquiry-form-integration.js`.
2. Set `API_BASE` at the top to your Render URL.
3. In your GitHub Pages repo, add this file (e.g. as `js/enquiry-form-integration.js`).
4. On your enquiry form's `<form>` tag, add `id="rjEnquiryForm"`.
5. Make sure each input has a matching `name` attribute — see the comment block at the top
   of the snippet for the full field list.
6. Add `<script src="js/enquiry-form-integration.js"></script>` before `</body>` on every page
   with the form (likely just the homepage, unless you have it elsewhere too).
7. Commit and push — GitHub Pages redeploys automatically.

Once this is live, form submissions will:
- Create a customer + enquiry + lead in Supabase
- Email you a notification
- Email the customer a confirmation with their Lead ID
- Immediately show up in the admin panel under **Leads**

## 7. Log in and try it

1. Visit `https://YOUR-RENDER-URL.onrender.com/admin`
2. Log in with `ADMIN_EMAIL` / the password you hashed in step 3
3. Add at least one Package, Vehicle Rate under **Packages & Pricing** so the quote builder
   has something to work with
4. Submit a test enquiry from your live site (or via `curl`/Postman against `/api/enquiries`)
   to confirm the full flow

---

## What's built now — full feature set (Phases 5-17)

- **Phase 5** — Smart Enquiry System
- **Phase 6** — CRM / Lead Management
- **Phase 7** — Quotation System (with branded PDF)
- **Phase 9** — WhatsApp semi-automation (pre-filled links, admin clicks to send)
- **Phase 10** — Booking Engine (quote → booking, manual "Mark as Paid")
- **Razorpay** — order creation + server-side webhook verification, supports advance/balance/full payment
- **Phase 11** — Customer Dashboard (email magic-link login, no password)
- **Phase 12** — Admin Dashboard (business metrics)
- **Phase 13** — Abandoned quote follow-up list
- **Phase 14** — Source → revenue conversion report
- **Phase 15** — Coupons management
- **Phase 16** — Invoice / Receipt / Voucher / Booking Confirmation PDFs
- **Phase 17** — Reviews (public submission, admin moderation) + manual referral coupons

## Additional setup for this batch

### Razorpay
1. Log into your Razorpay Dashboard → Settings → API Keys → generate a Key ID + Key Secret.
2. Add both to Render's environment variables as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. Go to Settings → Webhooks → Add a webhook pointing to:
   `https://YOUR-RENDER-URL.onrender.com/api/payments/webhook`
   Enable at least the `payment.captured` and `payment.failed` events.
4. Razorpay will show you a Webhook Secret when you create it — add that as `RAZORPAY_WEBHOOK_SECRET`.

### Database migration
Run `db/migration_2_phases_9_17.sql` in the Supabase SQL Editor (after `schema.sql`, which you should have already run).

### New pages now live at:
- `/admin` — now has Dashboard, Bookings, Coupons, and Reviews tabs in addition to Leads/Quotes/Catalog
- `/customer` — customer dashboard (magic-link login)
- `/review/:token` — public review submission page (linked from the "Request Review" WhatsApp message)

### Still deferred to the dedicated hardening/testing phases (by design)
- Security: rate limiting, input validation, Supabase Row Level Security, audit logs, scheduled backups
- Performance: caching, query optimization review, monitoring setup
- Final staging → production deployment checklist

## Estimated recurring cost at this stage

**$0/month** still, with one caveat: Razorpay charges standard transaction fees (currently ~2%
per transaction, confirm current rate in your Razorpay dashboard) — this isn't a subscription,
it's a per-transaction cost that only applies once you're actually collecting payments.
Supabase, Render, Resend, and GitHub Pages remain free tier. You'll likely want to upgrade
Render (~$7/mo) once traffic/admin usage grows past the free tier's sleep behavior.

