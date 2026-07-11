# Privacy Policy for Swiss Blade

Last updated: July 11, 2026

Swiss Blade is a Chrome extension for blocking common ads and trackers, detecting and downloading videos, capturing screenshots (visible viewport, crop area, or full page), and inspecting or clearing site storage for the active website.

## Data Collection

Swiss Blade does not collect, sell, transmit, or share user data with the developer or third parties.

The extension may access the active website URL, cookies, LocalStorage, SessionStorage, IndexedDB database names, Cache Storage names, tab screenshots, and network request details (content types, response headers, URLs) only when required for its features.

This information is processed locally in the user's browser and is not sent to any external server.

## How Data Is Used

Swiss Blade uses locally available browser data only for these purposes:

- Blocking common ad and tracker requests.
- Hiding common ad containers and sponsored page elements.
- Showing storage counts and details for the active website when the user clicks Inspect.
- Clearing cookies or site storage when the user clicks a Clear button.
- Saving screenshots (visible viewport, crop area, or full page) locally when the user clicks the Screenshot button and selects an option from the dropdown.
- Detecting video files loaded on the page (via network monitoring, page-level fetch/XHR interception, and `<video>` element tracking) and downloading videos when the user clicks the download button.
- Saving extension settings such as enabled state, blocked count, and allowlisted domains.

## Data Sharing

Swiss Blade does not send user data to any external server.

Swiss Blade does not sell user data.

Swiss Blade does not transfer user data to third parties.

Swiss Blade does not use user data for advertising, creditworthiness, lending, or purposes unrelated to the extension's single purpose.

## Screenshots

Screenshots are captured only after the user clicks the Screenshot button and selects an option from the dropdown (Visible, Crop Area, or Full Page).

- **Visible** — Captures the current viewport.
- **Crop Area** — Shows a drag-to-select overlay on the page; saves only the selected region.
- **Full Page** — Scrolls through the entire page, captures each section, and stitches them together using OffscreenCanvas.

Screenshots are saved locally through Chrome's downloads API and are not uploaded by Swiss Blade.

## Cookies and Site Storage

Cookies and site storage are inspected only when the user clicks Inspect. Cookies and site storage are cleared only when the user clicks a Clear button or Clear All.

Supported storage types include Cookies, LocalStorage, SessionStorage, IndexedDB, and Cache Storage.

## Video Detection

Video detection works entirely in the browser:
- **Network monitoring**: The background service worker inspects response headers and content types for video-related patterns. Byte-range (206 Partial Content) responses are skipped to avoid torrent chunk noise.
- **Page-level interception**: A script is injected into the page to detect video loads via fetch, XMLHttpRequest, and MediaSource APIs.
- **Element tracking**: The content script watches `<video>` elements for play events.

Detected video URLs are shown in the popup and are not transmitted anywhere. Downloading a video fetches it directly from the original source URL.

## Remote Code

Swiss Blade does not use remote code. All extension code is packaged inside the extension.

## Contact

For support or privacy questions, contact the project maintainer through the project repository or the support link listed on the Chrome Web Store page.
