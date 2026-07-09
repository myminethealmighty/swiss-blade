# Swiss Blade

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Visitors](https://visitor-badge.laobi.icu/badge?page_id=myminethealmighty.swiss-blade)

Swiss Blade is an open-source Chrome extension built with TypeScript, Next.js, and Manifest V3. It blocks common ad and tracker network requests, hides common ad containers on pages, captures visible-tab screenshots, and inspects or clears site storage from the popup.

This project is a practical privacy and utility extension. It is not a full EasyList-compatible engine yet, but the rule file and cosmetic selectors are organized so the blocker can grow safely over time.

## Project Status

Swiss Blade is actively evolving. The current version supports client-side Manifest V3 static rule interception, content-script cosmetic element hiding, cookie and storage inspection, and allowlisted domain options. All processes occur purely in the local browser context to protect user privacy.

## What It Does

- Blocks known ad-serving and tracking network requests using MV3 static rules.
- Hides common empty ad containers, sponsored blocks, and Google ad frames with a content script.
- Captures visible-tab screenshots named `swiss-blade.png` using Chrome's native downloads API with duplicate numbering.
- Inspects website storage (Cookies, LocalStorage, SessionStorage, IndexedDB, and Cache Storage).
- Supports selective storage clearing per type and a global "Clear All" action.
- Allows user-defined domains to bypass ad-blocking through an Options page allowlist.
- Runs entirely locally without sending user screenshots, storage data, or settings to any external server.
- Uses a post-build compiler check to ensure compliance with the Chrome Web Store Content Security Policy (CSP).

## Architecture

```text
public/
  rules/         declarativeNetRequest rule configurations (ads.json)
  icons/         Branded extension icons (16px, 32px, 48px, 128px)
  popup.html     Native Chrome extension popup shell
  popup.css      Native Chrome extension popup styling

extension/
  background.ts  Service worker for dynamic allowlists, screenshots, and cookies
  content.ts     Content script for cosmetic hiding and DOM storage queries
  popup.ts       Popup event controller and inspector UI renderer

src/
  app/
    options/     Next.js allowlist settings UI
    globals.css   Next.js dashboard styles
```

## Runtime Flow

1. **Popup Load**: The user clicks the extension icon, launching `popup.html`. `popup.ts` checks protection state and queries storage counts.
2. **Layer 1 Network Block**: Chrome intercepts network requests from the static list in `public/rules/ads.json` if protection is enabled.
3. **Layer 2 Cosmetic Block**: The content script `content.ts` injects display rules and runs a `MutationObserver` to hide ad boxes.
4. **Inspect Storage**: Tapping **Inspect** checks cookies from the service worker, and DOM storage databases from the content script.
5. **Dynamic Allowlist**: The options page stores domains in Chrome storage, which the service worker maps to active bypass rules.

## Supported Storage Types

| Storage Type    | Scope                  | Inspection Method              | Clearing Method                |
| --------------- | ---------------------- | ------------------------------ | ------------------------------ |
| **Cookies**     | Domain / Domain Wild   | `chrome.cookies.getAll` (BG)   | `chrome.cookies.remove` (BG)   |
| **Local**       | Origin                 | `localStorage.length` (CS)     | `localStorage.clear()` (CS)    |
| **Session**     | Origin / Tab Session   | `sessionStorage.length` (CS)   | `sessionStorage.clear()` (CS)   |
| **IndexedDB**   | Origin Databases       | `indexedDB.databases()` (CS)   | `indexedDB.deleteDatabase` (CS)|
| **Cache**       | Service Worker Caches  | `caches.keys()` (CS)           | `caches.delete(name)` (CS)     |

*(BG = Background Service Worker, CS = Content Script)*

## Install for Development

```bash
npm install
npm run build
```

Then load the extension in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked**.
4. Select the generated `out` folder from this project root.
5. After changing source files, run `npm run build` again and reload the extension in Chrome.

## Package for Chrome Web Store

```bash
npm run package:chrome
```

This creates `swiss-blade-chrome.zip` from the contents of the `out` directory. Upload this ZIP directly to the Chrome Web Store Developer Dashboard.

Before publishing:
- Check `public/manifest.json` for name, description, version, and requested permissions.
- Ensure the version is incremented for web store upgrades.
- Ensure `manifest.json` is at the root of the ZIP file.

## How Blocking Works

Swiss Blade uses two layers.

The first layer is network blocking in `public/rules/ads.json`. Chrome reads this file through `declarative_net_request.rule_resources` in `public/manifest.json`. Rules block known ad and tracker domains, plus common ad-serving URL paths such as `/ads/`, `/prebid`, `/vast`, and `/vpaid`.

The second layer is cosmetic filtering in `extension/content.ts`. Some ads leave empty boxes or are inserted after the page loads. The content script hides common ad containers, sponsored blocks, Google ad iframes, and similar page elements.

The popup count increases when either layer blocks or hides something.

## Screenshot Behavior

Click **Shot** in the popup to capture the visible part of the active tab. Chrome opens a save dialog and suggests `swiss-blade.png`. If the file already exists, Chrome's `uniquify` behavior creates names such as `swiss-blade (1).png`.

Area crop selection was removed from the main flow because Chrome closes extension popups when focus moves back to the page. Visible-tab capture is simpler and stable.

## Storage Inspector

Click **Inspect** to count storage for the current site. Click a count row to expand it and see details (such as keys and values). Click the row's **Clear** button to clear only that storage type. Click **Clear All** to remove all supported storage types for the active site.

Cookies are cleared by the background service worker with the Chrome cookies API. LocalStorage, SessionStorage, IndexedDB, and Cache Storage are cleared by the content script running inside the active tab.

## Options Page

The options page is built using Next.js (`src/app/options/page.tsx`). It manages the domain allowlist. Allowlisted domains are stored in Chrome extension local storage. The background worker watches allowlist changes and dynamically updates rules to permit requests on trusted domains.

## Open Source

- [MIT License](LICENSE)
- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Useful Commands

```bash
npm run dev                    # Start Next.js development server
npm run build                  # Compile extension and build static pages
npm run typecheck              # Check TypeScript errors
npm run lint                   # Run ESLint validation checks
npm run build:extension-scripts # Package popup/content/background scripts with esbuild
npm run package:chrome         # Package the built output into a ZIP for release
```
