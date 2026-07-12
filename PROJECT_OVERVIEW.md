# Project Overview For Future Sessions

## Purpose

Swiss Blade is an open-source Chrome extension built with TypeScript, and Manifest V3. It combines several utilities in one extension:

- **Ad blocking** (network + cosmetic) with category breakdown visibility
- **Video detection & download** (auto-detect playing videos, HLS stream download, floating download button)
- **Screenshot tools** (visible viewport, drag-to-crop area, full-page scroll-and-stitch)
- **Site storage inspection** (Cookies, LocalStorage, SessionStorage, IndexedDB, Cache Storage)

Everything runs locally in the browser — no data is ever sent to external servers.

## Layout

```text
public/
  rules/         Static declarativeNetRequest blocking rules (ads.json)
  icons/         Extension logo assets (16px, 32px, 48px, 128px)
  popup.html     Native extension popup view
  popup.css      Popup style sheets and theme configurations

extension/
  background.ts  Background service worker (ad rules, video detection, screenshots, HLS download, cookie APIs)
  content.ts     Content script (cosmetic ad hiding, DOM storage access, video element tracking, floating download button, page script injection)
  popup.ts       Popup control logic, UI rendering, event dispatchers

src/
  app/
    globals.css   CSS variables design system

scripts/
  externalize-inline-scripts.mjs  Post-build sanitizer for Chrome Web Store CSP compliance
```

## Runtime Flow

1. **Initialization**:
   - User clicks the extension icon → opens `popup.html`.
   - `extension/popup.ts` reads protection state, ad-block stats, and starts auto-refresh of video detection (2-second interval).

2. **Ad Blocking (Layer 1 — Network)**:
   - When enabled, the service worker updates declarative rulesets via `chrome.declarativeNetRequest`.
   - Chrome intercepts matching ad/tracker requests defined in `public/rules/ads.json`.

3. **Ad Blocking (Layer 2 — Cosmetic)**:
   - `extension/content.ts` injects CSS to hide ad elements on all pages.
   - A `MutationObserver` watches for dynamically loaded ad elements.
   - Each hidden element is categorized (Banner, Google, Iframe, Sponsored, Native).
   - Category counts are reported to the background and displayed as badges in the popup.

4. **Video Detection & Download**:
   - **Network level**: `chrome.webRequest.onHeadersReceived` monitors all responses for video content-types and URL patterns. Byte-range (206) responses are skipped to avoid torrent chunk noise.
   - **Page level**: Page script is injected into the page's main world via `chrome.scripting.executeScript({ world: "MAIN" })` (bypasses CSP). It patches `fetch`, `XMLHttpRequest`, and `MediaSource.addSourceBuffer` to detect video streams.
   - **Element level**: Content script watches all `<video>` elements for play events and reports their sources.
   - **Floating button**: A fixed-position "Download" button appears at bottom-right when a playing video is detected. Clicking it triggers a download.
   - **HLS support**: If the detected URL is an `.m3u8` manifest, the background downloads, parses, fetches all segments (parallel batches of 6), and concatenates them into a single `.ts` file.

5. **Screenshots**:
   - One **Screenshot** button with a dropdown menu: **Visible**, **Crop Area**, **Full Page**.
   - **Visible**: Captures the current viewport via `chrome.tabs.captureVisibleTab`.
   - **Crop Area**: Background captures the tab, content script shows a drag-to-select overlay, user selects a region, background crops the image and saves it.
   - **Full Page**: Background scrolls through the entire page via injected scroll scripts, captures each viewport, and stitches them together using OffscreenCanvas. Falls back to visible capture if scrolling fails.

6. **Storage Inspection**:
   - Clicking **Inspect** toggles the storage panel open/closed.
   - Cookies fetched by `background.ts` via `chrome.cookies.getAll`.
   - DOM storage counts queried by `content.ts`.
   - Each storage type can be expanded to view items, or cleared individually.
   - **Clear All** button inside the storage panel header wipes everything and refreshes the view.

## Key Files

- [public/manifest.json](file:///Users/minkhant/Desktop/MKT/swiss-blade/public/manifest.json) — Extension entry configuration (permissions, scripts, rulesets).
- [public/rules/ads.json](file:///Users/minkhant/Desktop/MKT/swiss-blade/public/rules/ads.json) — Ad/tracker network blocklist.
- [extension/background.ts](file:///Users/minkhant/Desktop/MKT/swiss-blade/extension/background.ts) — Service worker: ad rules, video webRequest detection, screenshot capture/stitch/crop, HLS download, cookie/storage APIs.
- [extension/content.ts](file:///Users/minkhant/Desktop/MKT/swiss-blade/extension/content.ts) — Content script: cosmetic ad hiding with categories, DOM storage, video element tracking, floating download button, page script injection coordinator, screenshot crop overlay.
- [extension/popup.ts](file:///Users/minkhant/Desktop/MKT/swiss-blade/extension/popup.ts) — Popup controller: ad stats, storage inspector, video list, screenshot dropdown, event handling.

## Extension Setup

Chrome loads the built static assets from:

```text
/Users/minkhant/Desktop/MKT/swiss-blade/out
```

### Loading the Extension in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode** toggle.
3. Click **Load unpacked**.
4. Select the `/Users/minkhant/Desktop/MKT/swiss-blade/out` folder.

When editing code, re-run `npm run build` and reload the extension on the Chrome extensions page.

## Build Commands

```bash
npm install                     # Install dependencies
npm run dev                     # Start dev server
npm run typecheck               # Check TypeScript errors
npm run lint                    # Run ESLint checks
npm run build                   # Compile extension + build pages + externalizer
npm run package:chrome          # Compress out/ into swiss-blade-chrome.zip
```

## Key Design Decisions

- **Page script injection**: Uses `chrome.scripting.executeScript({ world: "MAIN" })` via background instead of DOM `<script>` injection to bypass Content Security Policy restrictions.
- **Safe message wrapper**: All `chrome.runtime.sendMessage` calls in content.ts go through `safeSendMessage()` which catches "Extension context invalidated" errors silently, preventing crashes after extension reload.
- **Torrent filtering**: Byte-range responses (status 206, `Content-Range` header) are skipped in the webRequest handler to avoid polluting the video list with P2P chunk noise.
- **HLS download**: Segments are downloaded in parallel batches of 6, concatenated into a single ArrayBuffer, converted to a Blob, then to a data URL via `blobToDataUrl()` helper, and saved via `chrome.downloads.download`.
- **Ad categories**: `AD_RULES` replaces flat `AD_SELECTORS` — each selector has a category label. Category counts are tracked and displayed as badges in the popup for visibility into what's being blocked.
