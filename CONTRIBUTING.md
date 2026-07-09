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

5. Test the options page locally by running the Next.js development server:

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

# Compile extension scripts and Next.js static pages
npm run build
```

## Pull Request Guidelines

- **Keep changes focused**: Make small, thematic pull requests instead of large multi-feature refactors.
- **Test locally**: Always load the updated unpacked extension in Chrome from `out` and confirm the functionality before submitting.
- **UI Changes**: If you are modifying the popup HTML/CSS or options page, please include screenshots or screen recordings showing the changes.
- **No Private Data**: Do not commit real passwords, domain lists, or allowlists containing private information.

## Updating Block Rules & Selectors

- **Network Rules**: Edit [public/rules/ads.json](file:///Users/minkhant/Desktop/MKT/swiss-blade/public/rules/ads.json) to add new domains, URL patterns, or filters. Ensure rule IDs are unique.
- **Cosmetic Selectors**: Edit [extension/content.ts](file:///Users/minkhant/Desktop/MKT/swiss-blade/extension/content.ts) to update elements hidden by the extension during page loading or DOM changes.
