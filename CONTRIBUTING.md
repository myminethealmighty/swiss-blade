# Contributing

Thanks for taking an interest in Swiss Blade. The project is an open-source Chrome extension, and small, focused pull requests are easiest to review.

## Development Setup

1. Install Node.js (version 20 or newer is recommended).
2. Clone the repository and install dependencies:

```bash
npm install
```

3. Build the extension:

```bash
npm run build
```

4. Load the compiled extension into Chrome:
   - Open `chrome://extensions` in Google Chrome.
   - Toggle **Developer mode** on in the upper-right corner.
   - Click the **Load unpacked** button.
   - Select the `out` directory created in the root of this project.

```bash
npm run dev
```

## Before Opening A Pull Request

Run these checks locally to ensure the build compiles and code standards are met:

```bash
# Verify TypeScript compilation
npm run typecheck

# Validate linting compliance
npm run lint

# Compile extension scripts and static pages
npm run build
```

## Pull Request Guidelines

- **Keep changes focused**: Make small, thematic pull requests instead of large multi-feature refactors.
- **Test locally**: Always load the updated unpacked extension in Chrome from `out` and confirm the functionality before submitting.
- **UI Changes**: If you are modifying the popup HTML/CSS page, please include screenshots or screen recordings showing the changes.
- **No Private Data**: Do not commit real passwords or other private information.

## Updating Block Rules & Selectors

- **Network Rules**: Edit [public/rules/ads.json](file:///Users/minkhant/Desktop/MKT/swiss-blade/public/rules/ads.json) to add new domains, URL patterns, or filters. Ensure rule IDs are unique.
- **Cosmetic Selectors**: Edit [extension/content.ts](file:///Users/minkhant/Desktop/MKT/swiss-blade/extension/content.ts) to update elements hidden by the extension during page loading or DOM changes. Selectors are organized as `AD_RULES` with category labels (Banner, Google, Iframe, Sponsored, Native).

## Testing New Features

- **Video Detection**: Load a page with video content and verify the floating "Download" button appears and the "Now Playing" card in the popup shows correct details. HLS streams (`.m3u8`) should download and concatenate segments properly.
- **Screenshots**: Test all three modes — Visible (instant capture), Crop Area (drag-to-select overlay), and Full Page (scroll + stitch). Press Esc to cancel a crop selection.
- **Ad Blocking**: Enable protection and check the popup for category badge breakdowns (Banner, Google, Iframe, Sponsored, Native).
