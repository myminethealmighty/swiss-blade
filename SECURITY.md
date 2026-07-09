# Security Policy

## Supported Versions

Swiss Blade is currently in pre-1.0 development. Security updates are applied directly to the `main` branch.

## Reporting A Vulnerability

Please do not open public issues for sensitive security vulnerabilities.

Report privately by contacting the maintainer through GitHub or another trusted private channel. Include:

- A clear description of the issue.
- Steps to reproduce it.
- Affected components (e.g., background scripts, content scripts, or popup).
- Any proof of concept that is safe to share.

## Secrets

Do not commit or publish local allowlists, site credentials, or extension cookies in test files or pull request snapshots.

## Chrome Extension Safety

Swiss Blade runs under Chrome's Manifest V3 standard, which enforces several security boundaries:

- **No Remote Code**: Swiss Blade compiles all scripts locally. We strictly avoid loading or executing remotely hosted scripts to prevent cross-site scripting (XSS) or remote command execution.
- **Sanitized Inputs**: Dynamic DOM additions (such as the allowlist editor in the options page) must sanitize inputs to avoid DOM-based XSS attacks.
- **Minimal Permissions**: The extension requests only the minimum set of permissions necessary to function (e.g., `declarativeNetRequest`, `activeTab`, `cookies`, `scripting`, `downloads`). Avoid broadening host permissions unless absolutely required.

## Privacy-First Policy

To maintain user privacy:
- **Screenshots**: Screen captures are only taken when the user explicitly clicks the **Shot** button. Screenshots are downloaded directly to the local machine via Chrome's downloads API. They are never uploaded or transmitted to any external server.
- **Storage Inspector**: Site storage counts and keys are inspected in-memory and are never stored or sent anywhere.
- **Settings & Allowlist**: Extension settings and allowlisted domains are saved strictly in the user's Chrome local storage using the `chrome.storage.local` API.
