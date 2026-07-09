# Project Overview For Future Sessions

## Purpose

Swiss Blade is an open-source Chrome extension built with TypeScript, Next.js, and Manifest V3. It combines several utilities in one extension: blocking common ad and tracker network requests, cosmetic page cleanup of ad elements, visible-tab screenshot capture, site storage inspection, and domain allowlist options.

It is designed to run locally in the user's browser, prioritizing privacy by processing and storing all configuration, block rules, and captured screenshots on the user's local machine.

## Layout

```text
public/
  rules/         Static declarativeNetRequest blocking rules (ads.json)
  icons/         Extension logo assets (16px, 32px, 48px, 128px)
  popup.html     Native extension popup view
  popup.css      Popup style sheets and theme configurations

extension/
  background.ts  Background service worker (ad rules, screenshots, cookie API)
  content.ts     Content script (cosmetic ad hiding, DOM storage API access)
  popup.ts       Popup control logic, UI rendering, event dispatchers

src/
  app/
    options/     Next.js allowlist settings page (page.tsx)
    globals.css   CSS variables and options page design system

scripts/
  externalize-inline-scripts.mjs  Post-build sanitizer for Chrome Web Store CSP compliance
```

## Runtime Flow

1. **Initialization**:
   - The user opens Chrome and clicks the Swiss Blade icon, which opens the native `popup.html`.
   - `extension/popup.ts` checks the current activation state (ON/OFF) and requests storage statistics from the background worker.

2. **Network Blocking (Layer 1)**:
   - When enabled (ON), the service worker (`extension/background.ts`) updates declarative rulesets via `chrome.declarativeNetRequest`.
   - Chrome intercepts matching ad and tracker requests defined in `public/rules/ads.json` before they are sent.

3. **Cosmetic Filtering (Layer 2)**:
   - The content script (`extension/content.ts`) runs on page load.
   - It injects styles to hide common ad and sponsored elements.
   - A `MutationObserver` watches for dynamically loaded elements to ensure newly added ad slots are hidden automatically.
   - The content script reports hidden count increments to `background.ts`, updating the extension's badge count.

4. **Tab Storage Inspection**:
   - Tapping **Inspect** in the popup triggers a query:
     - Cookies are fetched by `background.ts` using `chrome.cookies.getAll`.
     - `LocalStorage`, `SessionStorage`, `IndexedDB`, and `Cache Storage` counts are queried by `content.ts` in the page context.
   - The user can expand each count row to view item keys and values, or clear them selectively.

5. **Screenshot Generation**:
   - Clicking **Screenshot** in the popup sends a message to `background.ts`.
   - The service worker calls `chrome.tabs.captureVisibleTab` and prompts the user to download the image as `swiss-blade.png` using `chrome.downloads.download`.

## Key Files

- [public/manifest.json](file:///Users/minkhant/Desktop/MKT/swiss-blade/public/manifest.json) - Extension entry configuration defining permissions, scripts, and static rules.
- [public/rules/ads.json](file:///Users/minkhant/Desktop/MKT/swiss-blade/public/rules/ads.json) - Ad/tracker network blocklist database.
- [extension/background.ts](file:///Users/minkhant/Desktop/MKT/swiss-blade/extension/background.ts) - Service worker manager handling cookies, tabs, dynamic rules, and screenshots.
- [extension/content.ts](file:///Users/minkhant/Desktop/MKT/swiss-blade/extension/content.ts) - DOM content worker executing storage analysis and cosmetic filters.
- [extension/popup.ts](file:///Users/minkhant/Desktop/MKT/swiss-blade/extension/popup.ts) - Popup controller managing inspector rendering and user actions.
- [src/app/options/page.tsx](file:///Users/minkhant/Desktop/MKT/swiss-blade/src/app/options/page.tsx) - Options app managing user allowlisted domains.
- [scripts/externalize-inline-scripts.mjs](file:///Users/minkhant/Desktop/MKT/swiss-blade/scripts/externalize-inline-scripts.mjs) - Next.js build output adapter complying with CSP policies.

## Extension Setup

Chrome does not load the source files directly. It loads the built static assets from:
```text
/Users/minkhant/Desktop/MKT/swiss-blade/out
```

### Loading the Extension in Chrome:
1. Open `chrome://extensions`.
2. Enable **Developer mode** toggle.
3. Click **Load unpacked**.
4. Select the generated `/Users/minkhant/Desktop/MKT/swiss-blade/out` folder.

When editing code, you must re-run the build script (`npm run build`) and hit the reload icon on the Swiss Blade card in `chrome://extensions`.

## Why Next.js and Native Popup Coexist

Next.js provides a convenient dashboard structure, which Swiss Blade uses for the allowlist options page. However, running a Next.js client directly inside a Chrome extension popup causes a flickering UI because Chrome serves static pre-hydrated HTML snapshots before scripts run.

To solve this, the active extension popup uses standard, fast native pages (`popup.html` / `popup.css` / `popup.ts`), while options settings remain inside the Next.js options page.

## Local Start & Build Commands

Install dependencies:
```bash
npm install
```

Start the Next.js development server (for options page testing):
```bash
npm run dev
```

Check TypeScript errors:
```bash
npm run typecheck
```

Run ESLint checks:
```bash
npm run lint
```

Build the extension output (`out/` folder):
```bash
npm run build
```

This compiles extension background scripts using `esbuild`, builds Next.js pages, and executes the externalizer post-build script.

Package extension for publication:
```bash
npm run package:chrome
```

This compresses the `out/` content into `swiss-blade-chrome.zip` for direct upload to the Chrome Web Store Developer Console.
