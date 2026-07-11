# Changelog

All notable changes to this project will be documented here.

## v0.2.0 - 2026-07-11

### 🎬 Video Detection & Download
- Added automatic video detection via `webRequest` network monitoring, page-level fetch/XHR/MediaSource interception, and `<video>` element tracking.
- Added floating "Download" button that appears on the page when a playing video is detected.
- Added "Now Playing" card in the popup showing current video filename, format, and size (auto-refreshes every 2 seconds).
- Added HLS stream downloading — parses `.m3u8` manifests, downloads all segments in parallel (concurrency 6), and concatenates into a single `.ts` file.
- Added "Show all" toggle to reveal all detected videos on the page with individual download buttons.
- Added torrent/P2P filtering — skips byte-range (206 Partial Content) responses to avoid torrent chunk noise.
- Fixed CSP violation by migrating page script injection to `chrome.scripting.executeScript` with `world: "MAIN"` via background service worker.
- Fixed "Extension context invalidated" errors by wrapping all `chrome.runtime.sendMessage` calls in a safe error-handling wrapper.

### 📸 Screenshot Enhancements
- Replaced three separate screenshot buttons with a single dropdown (Visible / Crop Area / Full Page).
- Added **Crop Area** screenshot — drag-to-select overlay on the page, saves only the selected region to PNG.
- Added **Full Page** screenshot — scrolls through entire page, captures each viewport, stitches together with OffscreenCanvas into one tall PNG. Falls back to visible capture if scrolling is blocked.

### 🔇 Ad Block Visibility
- Added ad category tracking — each hidden element is categorized (Banner, Google, Iframe, Sponsored, Native).
- Popup now shows a color-coded category badge breakdown below the "Blocked today" count.
- Replaced flat `AD_SELECTORS` array with structured `AD_RULES` array containing selector + category pairs.

### 💄 UI Restructuring
- Removed allowlisted metric display and Options button.
- Made video detection section always visible (no toggle button needed).
- Inspect button now toggles storage panel open/closed.
- Clear All button moved inside storage panel header.
- Reset counter button moved inline next to "Blocked today" stat.
- Increased scroll areas: storage panel 340px, video section 420px, more-videos list 200px.
- Wider popup (380px) with cleaner visual hierarchy.

### 🛠 Technical Improvements
- All `chrome.runtime.sendMessage` calls in content.ts wrapped with `safeSendMessage()` to prevent crashes on extension reload.
- `chrome.scripting.executeScript` with `world: "MAIN"` used for page script injection to bypass Content Security Policy restrictions.
- Reduced webRequest size filter from 100KB to 1KB for broader video detection.
- HLS download reuses existing `blobToDataUrl` helper and uses proper `new URL()` resolution for segment URLs.

## v0.1.0 - 2026-07-09

- Migrated extension popups to native `popup.html`, `popup.css`, and `popup.ts` to solve flickering pre-hydration UI issues with Next.js in extension views.
- Implemented static network request blocking using Manifest V3 `declarativeNetRequest` rules inside `public/rules/ads.json`.
- Implemented cosmetic ad hiding content scripts inside `extension/content.ts` with a `MutationObserver` to clean up empty ad boxes on page updates.
- Added badge counts on the extension icon to represent blocked and hidden ads.
- Implemented active website storage inspection (Cookies, LocalStorage, SessionStorage, IndexedDB, and Cache Storage).
- Added selective and global "Clear All" buttons to wipe browser cookies and web storage.
- Added visible viewport screenshot capture using `chrome.tabs.captureVisibleTab` and Chrome's native downloads API, saving output files as `swiss-blade.png` with automatic duplication numbering.
- Integrated a Next.js options page (`src/app/options/page.tsx`) to manage the domain allowlist.
- Added custom dynamic rules syncing to let user-allowlisted domains bypass the ad-block rules.
- Created `scripts/externalize-inline-scripts.mjs` compiler post-build step to sanitize Next.js static exports for Chrome extension Content Security Policy (CSP) compliance.
