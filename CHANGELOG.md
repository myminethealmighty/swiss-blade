# Changelog

All notable changes to this project will be documented here.

This project does not follow a formal release cycle yet.

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
