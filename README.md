# Swiss Blade

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Visitors](https://visitor-badge.laobi.icu/badge?page_id=myminethealmighty.swiss-blade)

Swiss Blade is an open-source Chrome extension built with TypeScript, Next.js, and Manifest V3. It combines ad blocking, video detection & downloading, screenshot tools (visible/crop/full page), and site storage inspection — all in one extension.

This project is a practical privacy and utility extension. Everything runs locally in your browser — no data is ever sent to any external server.

## What It Does

### 🔇 Ad Blocking
- Blocks known ad-serving and tracking network requests using MV3 static rules.
- Hides common ad containers, sponsored blocks, Google ad frames, and iframes via content script.
- Shows a **category breakdown** (Banner, Google, Iframe, Sponsored, Native) below the blocked count so you can see exactly what's being hidden.
- Domain allowlist to bypass blocking on trusted sites.

### 🎬 Video Detection & Download
- **Automatic detection** — Detects video files loaded on any page via:
  - Network request monitoring (`webRequest` API)
  - Page-level fetch/XHR/MediaSource interception (injected via `chrome.scripting.executeScript` with `world: "MAIN"` to bypass CSP)
  - Watching `<video>` elements for playback events
- **Floating download button** — Appears automatically on the page when a playing video is detected. Click to download instantly.
- **Now Playing card** — Always visible in the popup, showing the current video's filename, format, and size.
- **HLS stream support** — Detects `.m3u8` playlists and downloads the full video by parsing the manifest, downloading all segments in parallel, and concatenating them into a single `.ts` file.
- **"Show all" option** — Reveals all detected videos on the page with individual download buttons.
- **Torrent/P2P filtering** — Skips byte-range (206 Partial Content) responses to avoid flooding the list with torrent chunk entries.

### 📸 Screenshot Tools
A single **Screenshot** button with a dropdown menu offering three options:

| Option | Description |
| ------ | ----------- |
| **Visible** | Captures the visible viewport of the active tab. |
| **Crop Area** | Shows a drag-to-select overlay on the page; saves only the selected region. |
| **Full Page** | Scrolls through the entire page, captures each section, and stitches them together into one full-height PNG using OffscreenCanvas. |

### 🔍 Storage Inspector
- Inspects all site storage types: Cookies, LocalStorage, SessionStorage, IndexedDB, and Cache Storage.
- Expand each count row to view individual keys/values.
- Clear individual storage types or use **Clear All**.
- Storage panel toggles open/closed with the Inspect button.

## Installation

### Chrome Web Store
[Install from Chrome Web Store](https://chromewebstore.google.com/detail/swiss-blade/nmblebkhgncabdbnaikjfcddpedebipf)

### Development Build
```bash
npm install
npm run build
```

Then load the extension in Chrome:
1. Open `chrome://extensions`.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked**.
4. Select the `out` folder from this project root.

## Architecture

```text
public/
  rules/         declarativeNetRequest rule configurations (ads.json)
  icons/         Branded extension icons (16px, 32px, 48px, 128px)
  popup.html     Native Chrome extension popup shell
  popup.css      Native Chrome extension popup styling

extension/
  background.ts  Service worker — ad rules, video detection (webRequest), screenshot capture & stitching, HLS download, storage APIs
  content.ts     Content script — cosmetic ad hiding, DOM storage queries, page script injection, video element tracking, floating download button
  popup.ts       Popup controller — UI rendering, storage inspector, video list, screenshot dropdown, event handling
```

## Runtime Flow

1. **Popup Load**: Clicking the extension icon opens `popup.html`. `popup.ts` reads protection state, ad-block stats, and starts the video detection auto-refresh cycle.
2. **Ad Blocking (Layer 1)**: Chrome's `declarativeNetRequest` intercepts network requests matching `public/rules/ads.json` when protection is enabled.
3. **Ad Blocking (Layer 2)**: The content script injects CSS to hide ad containers and runs a `MutationObserver` to catch dynamically added elements. Category counts are tracked (Banner, Google, Iframe, etc.) and displayed in the popup.
4. **Video Detection**: The background service worker monitors all network responses for video content-type headers. The content script injects a page-level script (via `chrome.scripting.executeScript`) that patches `fetch`, `XMLHttpRequest`, and `MediaSource.addSourceBuffer` to detect video streams. A floating "Download" button appears on the page when a playing video is found.
5. **Screenshots**: Clicking the Screenshot dropdown reveals three options — Visible (capture viewport), Crop (drag-to-select area), or Full Page (scroll + stitch with OffscreenCanvas).
6. **Storage Inspection**: Tapping Inspect reads cookies from the background and DOM storage from the content script. The panel toggles open/closed on each click.

## Supported Storage Types

| Storage Type    | Inspection Method            | Clearing Method              |
| --------------- | ---------------------------- | ---------------------------- |
| **Cookies**     | `chrome.cookies.getAll` (BG) | `chrome.cookies.remove` (BG) |
| **Local**       | `localStorage.length` (CS)   | `localStorage.clear()` (CS)  |
| **Session**     | `sessionStorage.length` (CS) | `sessionStorage.clear()` (CS)|
| **IndexedDB**   | `indexedDB.databases()` (CS) | `indexedDB.deleteDatabase`(CS)|
| **Cache**       | `caches.keys()` (CS)         | `caches.delete(name)` (CS)   |

*(BG = Background Service Worker, CS = Content Script)*

## Ad Block Categories

When ads are hidden, the popup shows a color-coded breakdown:

| Category | Examples |
| -------- | -------- |
| **Banner** | Generic `[id^="ad-"]`, `[class*="ad-container"]`, `[data-ad]` |
| **Google** | `ins.adsbygoogle`, `[id*="google_ads"]`, `[data-google-query-id]` |
| **Iframe** | `iframe[src*="doubleclick.net"]`, ad network iframes |
| **Sponsored** | `[class*="sponsor"]`, `[class*="promoted"]`, `[aria-label*="sponsored"]` |
| **Native** | `[class*="native-ad"]` |

## Screenshots

The **Screenshot** button opens a dropdown with three options:

- **Visible** — Captures the current viewport. Saves as PNG via Chrome's downloads API.
- **Crop Area** — A transparent overlay appears on the page. Drag to select a region; release to save just that area. Press Esc to cancel.
- **Full Page** — The extension scrolls through the entire page, captures each section, and stitches them into one tall PNG using OffscreenCanvas. Falls back to a single visible capture if scrolling is blocked.

## Options Page

The options page is built using Next.js (`src/app/options/page.tsx`). It manages the domain allowlist. Allowlisted domains are stored in Chrome extension local storage and dynamically create bypass rules.

## Privacy

- All processing happens locally — no data is sent to any server.
- Screenshots are saved to your local machine via Chrome's downloads API. They are never uploaded.
- Video detection runs entirely in your browser; detected URLs are not transmitted anywhere.
- Settings and allowlists are stored only in Chrome's local storage.

## Commands

```bash
npm run dev                    # Start Next.js development server
npm run build                  # Compile extension and build static pages
npm run typecheck              # Check TypeScript errors
npm run lint                   # Run ESLint validation checks
npm run build:extension-scripts # Package popup/content/background scripts with esbuild
npm run package:chrome         # Package the built output into a ZIP for release
```

## License

- [MIT License](LICENSE)
- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
