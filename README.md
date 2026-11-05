# Masjid Nuh website

The public website for Masjid Nuh, Fort Erie, and an admin dashboard for changing prayer times. Admins sign in with their Microsoft account.

- **Website:** `/`
- **Admin dashboard:** `/admin` (Microsoft sign-in, admins only)
- **TV screen for the masjid:** `/tv` (prayer times, clock, dates, rotating posters and notices)

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
| `public/js/masjid.js` | Prayer-time engine and settings model, shared by the site, the dashboard and the TV screen |
| `public/tv/index.html` | The TV screen |
| `public/admin/tv/index.html` | Dashboard page for managing the TV screen |
| `public/js/qrcode.js` | QR code generator for the TV slides (MIT licence, by Kazuhiko Arase) |
| `public/_headers` | Security and caching headers |
| `functions/auth/` | Microsoft sign-in: `login`, `callback`, `logout` |
| `functions/admin/_middleware.js` | Blocks `/admin` unless you're a signed-in admin |
| `functions/api/` | `settings`, `history`, `admins`, `me`, `tv`, `slides` |
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
| `ADMIN_EMAILS` | Text | Owner emails, separated by commas, for example `imam@masjidnuh.ca,alvi@outlook.com`. Owners can always sign in. |
| `ADMIN_GROUP_IDS` | Text | *Optional.* Object IDs of the Entra groups allowed in, separated by commas. See **Limit access to Entra groups** below. |

Then go to **Deployments** and **Retry deployment** on the latest one so the settings take effect.

### 6. Sign in
Open `https://YOUR-PROJECT.pages.dev/admin`, sign in with an owner's Microsoft account, and you're in. Add other admins under **Admins** in the dashboard. They sign in with that exact email address.

### 7. Limit access to Entra groups (optional)
Use this to let in only members of certain Microsoft 365 / Entra groups, instead of adding admins by email in the dashboard.

1. **Create the group.** In entra.microsoft.com, go to **Groups**, then **All groups**, then **New group**.
   - Group type: **Security**
   - Name: for example `Masjid Nuh Website Admins`
   - Add the people who should manage the website as **Members**, then choose **Create**.
2. **Copy its Object ID.** Open the group. The **Object ID** is on its Overview page.
3. **Send groups at sign-in.** Go to **App registrations**, then **Masjid Nuh website**, then **Token configuration**, then **Add groups claim**.
   - Tick **Security groups**.
   - Under **ID**, choose **Group ID**.
   - Choose **Add**.
4. **Tell the site which groups.** In Cloudflare, add the variable `ADMIN_GROUP_IDS` (Text) with the Object ID. Separate several groups with commas. Then **Retry deployment**.

How it works once it's on:
- Only members of those groups, plus owners in `ADMIN_EMAILS`, can open the dashboard.
- The dashboard's **Admins** panel switches to showing this, and adding people by email is turned off.
- To give or remove access, change the group's members in Microsoft 365.
- A change applies the next time that person signs in. Sessions last at most 8 hours.
- Removing a group ID from `ADMIN_GROUP_IDS` cuts off that group immediately.
- Nested groups count: someone in a group that sits inside the admin group gets access too.

Optional extra lock: in **Enterprise applications**, open **Masjid Nuh website**, then **Properties**, and set **Assignment required** to **Yes**. Then add the group under **Users and groups**. Microsoft will then refuse to sign anyone else in at all. Assigning *groups* this way may need a Microsoft Entra ID P1 license (included in Microsoft 365 Business Premium). The group claim above works without it.

### 8. Use the masjid's domain (optional)
In the Pages project open **Custom domains**, then **Set up a custom domain**. If the domain's DNS is on Cloudflare this takes one click; otherwise add the CNAME record it shows you at your registrar.

Then add `https://yourdomain/auth/callback` as another redirect URI in Microsoft (step 2). Keep the `pages.dev` one too.

## Using the dashboard

- **Iqamah times:** set each prayer to *After adhan* (for example, 10 minutes) or *Fixed time* (for example, 1:30 pm).
- **Schedule a change:** sets new iqamah times that start on a future date, for things like the clocks changing in March and November, or Ramadan. The site switches over automatically on that date.
- **Preview:** pick any date to see exactly what the site will show. You'll see a warning if a fixed iqamah falls before the adhan, or if the khutbah starts before Dhuhr.
- **Announcement:** a banner across the top of the site.
- **Recent changes:** who saved what and when, with one-click restore.
- **Admins:** add or remove people by email. This takes effect immediately. If group access is on, manage the group in Microsoft 365 instead.

Changes appear on the website within a minute.

## The TV screen

`https://masjidnuh.pages.dev/tv` is a full-screen display for a TV in the masjid. It shows:
- a large clock, with today's date in English and Hijri (English and Arabic)
- a countdown to the next adhan, then to the iqamah. In the last two minutes it asks people to straighten the rows.
- all five prayers with adhan and iqamah times. The next prayer is highlighted. On Fridays, Dhuhr becomes Jumu'ah with the khutbah and prayer times. After Isha it switches to tomorrow's times.
- posters and text notices that take turns, each with an optional QR code, plus a donation slide with a QR code
- rotating messages along the bottom, including the website announcement
- a "prayer in progress, please silence your phone" screen for a few minutes after each iqamah, and during the Jumu'ah khutbah

It uses the same prayer times as the website, so changing an iqamah in the dashboard changes the TV too. It's designed for 1920×1080 and scales to fit any screen, including 4K.

### Managing it
Open the dashboard, then **TV screen**. From there you can:
- **Add a poster:** upload a picture. A landscape 1920×1080 image fills the screen best. Portrait posters are shown in full against a blurred background. Pictures are shrunk automatically before upload.
- **Add a text notice:** a heading and a short message.
- Give any slide a **QR code** (a web address and a caption), **dates** to show it from and until, and how many **seconds** it stays on screen.
- Turn slides on and off, change their order, edit them or delete them.
- Under **Screen settings**: the bottom messages, the donation slide, how long the prayer screen stays up, a Hijri date adjustment for local moon sighting, and a 24-hour clock.
- Use the **Preview** to see the screen right now, during an iqamah countdown, during prayer, on a Friday, or after Isha.

The TV checks for changes every two minutes. If the internet drops, it keeps showing the last saved times and notices, and says so in the bottom right corner.

### Setting up the TV computer
Any small computer that runs Chrome works, for example a mini PC (Intel NUC, Beelink and similar), an old laptop, a Mac mini, or a Raspberry Pi 4 or 5. A computer is more reliable than a smart TV's built-in browser.

1. Connect the computer to the TV with HDMI, and to the internet.
2. Turn on automatic date and time, with the time zone set to **Eastern (Toronto)**. The clock and countdowns use the computer's time.
3. Turn off sleep, the screen saver, and the TV's own "auto power off" or eco timer.
4. Make it open the screen by itself when the computer starts:

**Windows**
- Turn on automatic sign-in for the account the TV uses (`netplwiz`).
- Press **Win+R**, type `shell:startup` and press Enter. In that folder, right-click and choose **New**, then **Shortcut**, and paste:
  ```
  "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --noerrdialogs --disable-session-crashed-bubble --disable-infobars https://masjidnuh.pages.dev/tv
  ```
- Name it `Masjid TV`. Chrome now opens full screen at sign-in. To exit kiosk mode, press **Alt+F4**.

**Mac**
- Open **Script Editor**, paste the line below, and save it as an **Application** called `Masjid TV`:
  ```
  do shell script "open -na 'Google Chrome' --args --kiosk --noerrdialogs https://masjidnuh.pages.dev/tv"
  ```
- Add it under **System Settings**, then **General**, then **Login Items**. Set **Energy** so the display never sleeps. To exit, press **Cmd+Q**.

**Raspberry Pi (Raspberry Pi OS)**
- Add this line to `~/.config/labwc/autostart` (or `~/.config/lxsession/LXDE-pi/autostart` on older versions):
  ```
  chromium-browser --kiosk --noerrdialogs --disable-session-crashed-bubble https://masjidnuh.pages.dev/tv
  ```

The screen reloads itself once a night, around 3:10 am, to pick up any website updates. To test it without kiosk mode, open the address in Chrome and double-click to go full screen.

## Editing other content

These parts aren't on the dashboard. Edit them in `public/index.html` and push to GitHub. Cloudflare redeploys automatically in about a minute.

- **Weekly programs:** the `WEEK` list near the bottom of the file.
- **Online donations:** handled by the embedded DonorChoice form (`donorchoice.ca/embedded/masjidnuh`) in the Donate section. Campaigns such as Mosque Donation, Sadaqah, Zakat and Quran Class are managed in your DonorChoice account, and changes show up on the site automatically.
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

The tests check settings validation, signed session cookies (tampered or wrongly signed cookies are rejected), group-based access, and redirect safety.

## Security

- Sign-in uses Microsoft's standard authorization code flow with PKCE. Passwords never touch this site.
- Sessions are HMAC-signed, `HttpOnly`, `Secure`, `SameSite=Lax` cookies that last 8 hours. With group access on, the session holds only the allowed group IDs the person belongs to, and nothing else from their account.
- Admin access is checked against the database on every request, so removing an admin takes effect immediately.
- Changes are only accepted from the site's own pages (an `Origin` check), and the dashboard only accepts known settings in known formats.
- After sign-in, people can only be sent to pages on this site, never to outside links.
