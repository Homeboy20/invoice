# Xpress Printing Toolkit

Chrome extension (Manifest V3) for **XPRESS PRINTING TANZANIA** — xpressprinting.co.tz.

A daily-use toolkit for the print shop:

- **Quote calculator** — banners, large format & stickers per m²; t-shirts with automatic
  bulk pricing; business cards, mugs, teardrop banners, logo design. All prices in TZS,
  fully editable in Settings.
- **Print-quality checker** — drop in a client's image, or right-click any image on the
  web and choose **"Check print quality"**. Shows pixel size, megapixels, and the maximum
  print size at 300 / 150 / 75 DPI with a plain-language verdict.
- **WhatsApp quote composer** — one click builds a formatted quotation and opens WhatsApp
  to your configured number (copy-to-clipboard fallback included).
- **English / Kiswahili** interface toggle.

## Install (unpacked, for testing)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `src/` folder

## Building the zip

The packaged zip isn't committed to the repo (build artifact, not source — see
`.gitignore`). Rebuild it any time from `src/`:

```bash
cd src
tar -a -c -f ../xpress-printing-toolkit-v1.1.0.zip manifest.json background.js shared.js \
  checker-core.js xpt-pdf.js popup.html popup.js checker.html checker.js invoice.html \
  invoice.js options.html options.js style.css icons
```

## Upload to Chrome Web Store

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   (one-time $5 registration if you haven't already).
2. Click **New item** and upload the zip built above.
3. Fill in the listing — ready-made text is in `store-listing.md`, and `PRIVACY.md`
   answers the privacy questionnaire (no data collected).
4. Add screenshots (1280×800): open the popup and the checker page and capture them.
5. Submit for review.

## First-run setup

Open **Settings** (third tab in the popup) and set:
- Your WhatsApp number in international format, digits only (e.g. `2557XXXXXXXX`)
- Your real price list (defaults are placeholders)

Settings sync across Chrome profiles signed into the same account.

## PrintDesk — hosted, multi-tenant, freemium

`server/` is a separate product: any print shop signs up for its own account and its
invoices are stored server-side instead of in a browser. It's freemium —

- **Free**: 20 invoices/month, 1 staff user, PDFs carry a "FREE PLAN" watermark.
- **Premium** ($9 via PayPal or 25,000 TZS via ClickPesa mobile money, per 30 days):
  unlimited invoices and staff, no watermark.

A separate `/admin` panel (own login, own password) lets the platform owner see every
business, revenue collected, and manually comp or downgrade an account.

See [server/README.md](server/README.md) for how it works, how billing is wired up
(PayPal Orders API + ClickPesa checkout, no npm SDKs needed), and how to deploy it to
Coolify. It reuses `src/xpt-pdf.js` unmodified, so a PDF invoice looks identical whether
the extension or the hosted app produced it — the watermark is an opt-in flag the
extension never sets.

## Project layout

```
src/            The Chrome extension (this folder is what gets zipped)
server/         PrintDesk — the hosted multi-tenant web app, API, and billing
DESIGN.md       Extension design decisions
store-listing.md  Copy-paste text for the Chrome Web Store listing
PRIVACY.md      Extension privacy policy (no data collection)
Dockerfile, docker-compose.yaml   Build/run PrintDesk in a container
```
