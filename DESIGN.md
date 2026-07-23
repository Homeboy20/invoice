# Xpress Printing Toolkit — Design

**Date:** 2026-07-23
**For:** XPRESS PRINTING TANZANIA (xpressprinting.co.tz) — print shop in Moshi, Kilimanjaro.

## Context

The website is currently a WordPress skeleton (nav structure only, no content, pricing, or
contact info published). The extension therefore must be fully self-contained and
configurable — it cannot scrape or depend on the site.

## Goal

A Chrome extension (Manifest V3) the shop owner and staff use daily, ready to upload to
the Chrome Web Store.

## Concepts considered

1. **Customer-facing quick-quote popup** — rejected as core: customers won't install an
   extension for one local shop.
2. **Print Shop Toolkit for the business** — chosen: daily-use tools, works offline,
   no server required.
3. **Design-inspiration web clipper** — folded in: its best feature (right-click any web
   image → check print quality) is included via a context menu.

## Features

1. **Quote calculator** — banners / large format priced per m², t-shirts with quantity
   tiers, business cards, stickers, logo design flat fee. All prices editable in the
   options page; stored in `chrome.storage.sync` with sensible TZS defaults.
2. **Print-size checker** — drop an image (or right-click any image on the web →
   "Check print quality") → shows pixel dimensions, megapixels, and maximum print size
   at 300 DPI (flyers/cards), 150 DPI (posters), and 75 DPI (banners viewed from
   distance), with a plain-language verdict.
3. **WhatsApp quote composer** — builds a formatted quote message from the calculator
   and opens `wa.me/<shop number>`; copy-to-clipboard fallback.
4. **EN / Swahili toggle** — small custom dictionary, persisted preference.

## Architecture

```
manifest.json      MV3; permissions: storage, contextMenus only. No host permissions,
                   no remote code, no analytics.
background.js      Service worker: registers "Check print quality" context menu on
                   images; opens checker.html?img=<url> in a tab.
popup.html/css/js  3-tab popup: Quote | Checker | Settings shortcut.
checker.html/js    Full-page print-quality checker (context-menu target + drag-drop).
options.html/js    Price list, WhatsApp number, business name, language.
shared.js          Defaults, i18n dictionary, storage helpers, TZS formatting.
icons/             16/32/48/128 PNG.
```

Image dimensions are read via `<img>.naturalWidth/Height` — works cross-origin without
CORS or host permissions.

## Store readiness

- MV3, version 1.0.0, minimal permissions with clear justifications.
- No remote code, no data collection → simple privacy declaration (PRIVACY.md included).
- Deliverable: `xpress-printing-toolkit-v1.0.0.zip` uploadable as-is.
