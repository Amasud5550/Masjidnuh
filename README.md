# Masjid Nuh website

The public website for Masjid Nuh, Fort Erie, and an admin dashboard for changing prayer times. Admins sign in with their Microsoft account.

- **Website:** `/`
- **Admin dashboard:** `/admin` (Microsoft sign-in, admins only)

It's hosted on **Cloudflare Pages**, deployed from **GitHub**, and stores its settings in **Cloudflare D1**. All three are free at this size.

## How it works

```
Visitor ──► Cloudflare Pages ──► index.html ──► GET /api/settings ──► D1 database
                                                                        ▲
Admin ──► /admin ──► Microsoft sign-in ──► dashboard ──► PUT /api/settings
```

- Adhan times are calculated in the browser for 35 Queen St, Fort Erie. Nothing needs updating daily.
- Iqamah rules, Jumu'ah times, scheduled changes, the calculation method, the Ramadan date and the announcement banner all come from the dashboard.
- If the database can't be reached, the site falls back to the defaults in `public/js/masjid.js`, so prayer times always show.
- Every save is recorded along with the admin's email. The dashboard lists recent saves and can restore an earlier version.
- Admins are managed from the dashboard. **Owners** are listed in the `ADMIN_EMAILS` setting in Cloudflare and can't be removed from the dashboard, so you can never lock yourselves out.

## Files

| Path | What it is |
|---|---|
| `public/index.html` | Public website |
| `public/admin/index.html` | Admin dashboard |
| `public/403.html` | Shown when someone signs in but isn't an admin |
| `public/js/masjid.js` | Prayer-time engine and settings model, shared by the site and the dashboard |
| `public/_headers` | Security and caching headers |
| `functions/auth/` | Microsoft sign-in: `login`, `callback`, `logout` |
| `functions/admin/_middleware.js` | Blocks `/admin` unless you're a signed-in admin |
| `functions/api/` | `settings`, `history`, `admins`, `me` |
| `lib/` | Shared server code: sessions, Microsoft sign-in, database, validation |
| `test/` | Automated tests (`npm test`) |

## Setup (about 30 minutes, one time)

You'll need:
- a **GitHub** account
- a **Cloudflare** account (free)
- access to the masjid's **Microsoft 365** admin, or any Microsoft work account that can register apps

### 1. Put the code on GitHub
Create a new **private** repository (for example `masjid-nuh-site`) and upload the contents of this folder.

### 2. Register the site with Microsoft
This is what lets the site show "Sign in with Microsoft".

1. Go to **entra.microsoft.com** and sign in with your Microsoft 365 account.
2. Go to **App registrations**, then **New registration**.
   - **Name:** `Masjid Nuh website`
   - **Supported account types:** *Accounts in any organizational directory and personal Microsoft accounts*. This lets Outlook.com and Hotmail users be admins too. If only masjid Microsoft 365 accounts should ever sign in, choose *Accounts in this organizational directory only* instead (see `MS_TENANT` below).
   - **Redirect URI:** platform **Web**, value `https://YOUR-PROJECT.pages.dev/auth/callback`. You'll get the real address in step 4, and you can come back to update this.
3. Choose **Register**. On the overview page, copy the **Application (client) ID**.
4. Go to **Certificates & secrets**, then **New client secret**. Set it to expire in 24 months and copy the **Value** right away, because it's only shown once.
5. Put a reminder in your calendar to make a new secret before it expires. When it expires, sign-in stops working until you paste a new secret into Cloudflare.

### 3. Create the database
In the Cloudflare dashboard go to **Storage & Databases**, then **D1 SQL Database**, then **Create**. Name it `masjid-nuh`. You don't need to create any tables, because the site creates them itself.

### 4. Create the Pages project
1. In Cloudflare go to **Workers & Pages**, then **Create application**, then **Pages**, then **Connect to Git**. Sign in with GitHub, pick the repository, then choose **Install & Authorize** and **Begin setup**.
2. Build settings:
   - **Framework preset:** None
   - **Build command:** leave empty
   - **Build output directory:** `public`
3. Choose **Save and Deploy**. Note your address, for example `masjid-nuh.pages.dev`, and add `https://masjid-nuh.pages.dev/auth/callback` as the redirect URI in Microsoft (step 2).

### 5. Connect the settings
In the Pages project, go to **Settings**. Add these for **Production**.

**Bindings:** **Add**, choose **D1 database**. Variable name `DB`, database `masjid-nuh`.

**Variables and Secrets:**

| Name | Type | Value |
|---|---|---|
| `MS_CLIENT_ID` | Text | Application (client) ID from step 2 |
| `MS_CLIENT_SECRET` | **Secret** | Client secret value from step 2 |
| `MS_TENANT` | Text | `common` for any Microsoft account, or your Directory (tenant) ID for masjid accounts only |
| `SESSION_SECRET` | **Secret** | A long random string, at least 32 characters. Use a password generator. |
| `ADMIN_EMAILS` | Text | Owner emails, separated by commas, for example `imam@masjidnuh.ca,alvi@outlook.com` |

Then go to **Deployments** and **Retry deployment** on the latest one so the settings take effect.

### 6. Sign in
Open `https://YOUR-PROJECT.pages.dev/admin`, sign in with an owner's Microsoft account, and you're in. Add other admins under **Admins** in the dashboard. They sign in with that exact email address.

### 7. Use the masjid's domain (optional)
In the Pages project open **Custom domains**, then **Set up a custom domain**. If the domain's DNS is on Cloudflare this takes one click; otherwise add the CNAME record it shows you at your registrar.

Then add `https://yourdomain/auth/callback` as another redirect URI in Microsoft (step 2). Keep the `pages.dev` one too.

## Using the dashboard

- **Iqamah times:** set each prayer to *After adhan* (for example, 10 minutes) or *Fixed time* (for example, 1:30 pm).
- **Schedule a change:** sets new iqamah times that start on a future date, for things like the clocks changing in March and November, or Ramadan. The site switches over automatically on that date.
- **Preview:** pick any date to see exactly what the site will show. You'll see a warning if a fixed iqamah falls before the adhan, or if the khutbah starts before Dhuhr.
- **Announcement:** a banner across the top of the site.
- **Recent changes:** who saved what and when, with one-click restore.
- **Admins:** add or remove people by email. This takes effect immediately.

Changes appear on the website within a minute.

## Editing other content

These parts aren't on the dashboard. Edit them in `public/index.html` and push to GitHub. Cloudflare redeploys automatically in about a minute.

- **Weekly programs:** the `WEEK` list near the bottom of the file.
- **Online donations:** put your donation page link (Stripe, Square, CanadaHelps, Mohid and so on) in `DONATE_URL`.
- **Wording, services, the About section:** plain HTML.

## Running it on your own computer (optional)

```bash
npm install
cp .dev.vars.example .dev.vars    # fill in your values
npm run dev                       # http://localhost:8788
```

For local sign-in, add `http://localhost:8788/auth/callback` as a redirect URI in the Microsoft app registration.

## Tests

```bash
npm test
```

The tests check settings validation, signed session cookies (tampered or wrongly signed cookies are rejected), and redirect safety.

## Security

- Sign-in uses Microsoft's standard authorization code flow with PKCE. Passwords never touch this site.
- Sessions are HMAC-signed, `HttpOnly`, `Secure`, `SameSite=Lax` cookies that last 12 hours.
- Admin access is checked against the database on every request, so removing an admin takes effect immediately.
- Changes are only accepted from the site's own pages (an `Origin` check), and the dashboard only accepts known settings in known formats.
- After sign-in, people can only be sent to pages on this site, never to outside links.
