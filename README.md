# Swiss Blade

Swiss Blade is an open-source Chrome extension built with TypeScript, Next.js, and Manifest V3. It blocks common ad and tracker network requests, hides common ad containers on pages, captures visible-tab screenshots, and inspects or clears site storage from the popup.

This project is a practical privacy and utility extension. It is not a full EasyList-compatible engine yet, but the rule file and cosmetic selectors are organized so the blocker can grow safely over time.

## Features

- Manifest V3 request blocking with `declarativeNetRequest` static rules.
- Cosmetic page cleanup for common ad containers and sponsored blocks.
- On/off switch with badge count hidden while blocking is off.
- Visible-tab screenshot download named `swiss-blade.png` with Chrome duplicate numbering.
- Cookie, LocalStorage, SessionStorage, IndexedDB, and Cache Storage inspection.
- Clear buttons for each storage type and a Clear All action.
- Options page for allowlisting domains.
- Chrome-safe static export for loading from the generated `out` folder.

## Install for development

```bash
npm install
npm run build
```

Then load the extension in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select the generated `out` folder from this project.
5. After every code or rule change, run `npm run build` again and click the reload button on the extension card.

Chrome loads the built extension, not the TypeScript source. That is why the `out` folder matters.

## Package for Chrome Web Store

```bash
npm run package:chrome
```

This creates `swiss-blade-chrome.zip` from the contents of `out`. Upload that ZIP in the Chrome Web Store Developer Dashboard.

Before publishing:

- Check `public/manifest.json` for the final name, description, version, icons, permissions, and host permissions.
- Build and test the extension locally from `out`.
- Increment `version` in `public/manifest.json` for every Web Store update.
- Keep `manifest.json` at the root of the ZIP. The package script does this by zipping the contents of `out`, not the `out` directory itself.
- Prepare store listing images, a short description, a detailed description, privacy practices, and review notes explaining the storage inspector and all-sites blocking permissions.

## How blocking works

Swiss Blade uses two layers.

The first layer is network blocking in `public/rules/ads.json`. Chrome reads this file through `declarative_net_request.rule_resources` in `public/manifest.json`. Rules block known ad and tracker domains, plus common ad-serving URL paths such as `/ads/`, `/prebid`, `/vast`, and `/vpaid`.

The second layer is cosmetic filtering in `extension/content.ts`. Some ads leave empty boxes or are inserted after the page loads. The content script hides common ad containers, sponsored blocks, Google ad iframes, and similar page elements.

The popup count can increase when either layer blocks or hides something. Some ads may still appear because real ad blockers use very large maintained lists and site-specific filters. Swiss Blade now has a larger starter ruleset, but long-term quality needs a filter-list compiler and update pipeline.

## Screenshot behavior

Click **Shot** in the popup to capture the visible part of the active tab. Chrome opens a save dialog and suggests `swiss-blade.png`. If the file already exists, Chrome's `uniquify` behavior creates names such as `swiss-blade (1).png`.

Area crop selection was removed from the main flow because Chrome closes extension popups when focus moves back to the page, which made drag selection unreliable. Visible-tab capture is simpler and stable.

## Storage inspector

Click **Inspect** to count storage for the current site:

- Cookies
- LocalStorage
- SessionStorage
- IndexedDB
- Cache Storage

Click a count row to expand that row and see its details. Click the row's **Clear** button to clear only that storage type. Click **Clear All** to remove all supported storage types for the active site.

Cookies are cleared by the background service worker with the Chrome cookies API. LocalStorage, SessionStorage, IndexedDB, and Cache Storage are cleared by the content script running inside the active tab.

## Project layout

- `public/manifest.json` - Chrome extension manifest.
- `public/rules/ads.json` - Manifest V3 static blocking rules.
- `public/popup.html` and `public/popup.css` - native extension popup shell.
- `extension/popup.ts` - popup behavior.
- `extension/background.ts` - service worker for blocking state, badge count, screenshots, cookies, and messaging.
- `extension/content.ts` - cosmetic filtering and page storage access.
- `src/app/options/page.tsx` - allowlist options page.
- `scripts/externalize-inline-scripts.mjs` - post-build step that makes the Next.js export safe for Chrome extensions.

## Why the post-build script exists

Next.js creates web-app files such as `_next` assets and helper text files. Chrome extensions reject unpacked folders that contain Chrome-reserved names starting with `_`, and inline scripts are not allowed by the extension content security policy. The post-build script rewrites those generated files into Chrome-safe names and external script files inside `out`.

You do not need to run the Node patch commands manually. For normal development, use:

```bash
npm run build
```

For Web Store packaging, use:

```bash
npm run package:chrome
```

## Contributing

Issues and pull requests are welcome. Good next steps are stronger filter coverage, a real ABP/EasyList compiler, per-site rule controls, and automated extension tests.

## License

MIT
# swiss-blade
