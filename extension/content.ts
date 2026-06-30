export {};

type StorageType = "localStorage" | "sessionStorage" | "indexedDB" | "cacheStorage";

const AD_SELECTORS = [
  "ins.adsbygoogle",
  "[id^=\"ad-\"]",
  "[id^=\"ads-\"]",
  "[id*=\"-ad-\"]",
  "[id*=\"_ad_\"]",
  "[id*=\"ads_\"]",
  "[id*=\"ad_container\" i]",
  "[id*=\"ad-container\" i]",
  "[id*=\"ad_wrapper\" i]",
  "[id*=\"ad-wrapper\" i]",
  "[id*=\"google_ads\" i]",
  "[id*=\"google_ads_iframe\" i]",
  "[id*=\"banner-ad\" i]",
  "[id*=\"sponsor\" i]",
  "[class^=\"ad-\"]",
  "[class*=\" ad-\"]",
  "[class*=\"_ad_\"]",
  "[class*=\"-ad-\"]",
  "[class*=\" ads\" i]",
  "[class*=\"ad-container\" i]",
  "[class*=\"ad_container\" i]",
  "[class*=\"ad-wrapper\" i]",
  "[class*=\"ad_wrapper\" i]",
  "[class*=\"ad-slot\" i]",
  "[class*=\"ad_slot\" i]",
  "[class*=\"adbox\" i]",
  "[class*=\"adsbox\" i]",
  "[class*=\"adsbygoogle\" i]",
  "[class*=\"advert\" i]",
  "[class*=\"sponsor\" i]",
  "[class*=\"promoted\" i]",
  "[class*=\"native-ad\" i]",
  "[data-ad]",
  "[data-ad-slot]",
  "[data-ad-client]",
  "[data-ad-unit]",
  "[data-ad-format]",
  "[data-google-query-id]",
  "[data-testid*=\"ad\" i]",
  "[data-testid*=\"sponsor\" i]",
  "[aria-label*=\"advertisement\" i]",
  "[aria-label*=\"sponsored\" i]",
  "iframe[id^=\"google_ads_iframe\"]",
  "iframe[src*=\"doubleclick.net\"]",
  "iframe[src*=\"googlesyndication.com\"]",
  "iframe[src*=\"adservice.google.com\"]",
  "iframe[src*=\"adsystem.com\"]",
  "iframe[src*=\"adnxs.com\"]",
  "iframe[src*=\"amazon-adsystem.com\"]",
  "iframe[src*=\"outbrain.com\"]",
  "iframe[src*=\"taboola.com\"]",
  "iframe[src*=\"criteo.com\"]",
  "iframe[src*=\"pubmatic.com\"]"
];

const STYLE_ID = "swiss-blade-cosmetic-filter";
const SCREENSHOT_OVERLAY_ID = "swiss-blade-screenshot-overlay";
const REPORT_DELAY_MS = 750;

let pendingHiddenCount = 0;
let reportTimer: number | undefined;

function injectCosmeticRules() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `${AD_SELECTORS.join(",")}{display:none!important;visibility:hidden!important;min-height:0!important;}`;
  document.documentElement.appendChild(style);
}

function reportHiddenCount(count: number) {
  if (count <= 0) return;

  pendingHiddenCount += count;
  if (reportTimer) return;

  reportTimer = window.setTimeout(() => {
    const countToReport = pendingHiddenCount;
    pendingHiddenCount = 0;
    reportTimer = undefined;
    chrome.runtime.sendMessage({ type: "incrementBlocked", count: countToReport });
  }, REPORT_DELAY_MS);
}

function collapseAds(root: ParentNode = document) {
  let hiddenCount = 0;

  for (const selector of AD_SELECTORS) {
    for (const node of root.querySelectorAll<HTMLElement>(selector)) {
      if (node.dataset.swissBladeHidden === "true") continue;
      node.style.setProperty("display", "none", "important");
      node.style.setProperty("visibility", "hidden", "important");
      node.setAttribute("data-swiss-blade-hidden", "true");
      hiddenCount += 1;
    }
  }

  reportHiddenCount(hiddenCount);
}

function startCosmeticFiltering() {
  injectCosmeticRules();
  collapseAds();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const addedNode of mutation.addedNodes) {
        if (addedNode instanceof HTMLElement) {
          collapseAds(addedNode);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function isAllowlisted(allowlist: string[]) {
  const hostname = window.location.hostname.replace(/^www\./, "").toLowerCase();
  return allowlist.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function readStorage(storage: Storage) {
  const output: Record<string, string> = {};

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    output[key] = storage.getItem(key) ?? "";
  }

  return output;
}

async function inspectPageStorage() {
  const indexedDBDatabases = await indexedDB.databases().catch(() => []);
  const cacheNames = "caches" in window ? await caches.keys().catch(() => []) : [];

  return {
    localStorage: readStorage(localStorage),
    sessionStorage: readStorage(sessionStorage),
    indexedDB: indexedDBDatabases.map((database) => database.name).filter((name): name is string => Boolean(name)),
    cacheStorage: cacheNames
  };
}

async function clearIndexedDB() {
  const indexedDBDatabases = await indexedDB.databases().catch(() => []);

  await Promise.all(
    indexedDBDatabases
      .map((database) => database.name)
      .filter((name): name is string => Boolean(name))
      .map(
        (name) =>
          new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
          })
      )
  );
}

async function clearCacheStorage() {
  const cacheNames = "caches" in window ? await caches.keys().catch(() => []) : [];
  await Promise.all(cacheNames.map((name) => caches.delete(name).catch(() => false)));
}

async function clearPageStorageType(storageType: StorageType) {
  if (storageType === "localStorage") localStorage.clear();
  if (storageType === "sessionStorage") sessionStorage.clear();
  if (storageType === "indexedDB") await clearIndexedDB();
  if (storageType === "cacheStorage") await clearCacheStorage();
  return { ok: true };
}

async function clearPageStorage() {
  localStorage.clear();
  sessionStorage.clear();
  await clearIndexedDB();
  await clearCacheStorage();
  return { ok: true };
}

function startScreenshotSelection() {
  if (document.getElementById(SCREENSHOT_OVERLAY_ID)) return;

  const overlay = document.createElement("div");
  const selection = document.createElement("div");
  const hint = document.createElement("div");
  let startX = 0;
  let startY = 0;
  let currentRect = { x: 0, y: 0, width: 0, height: 0 };

  overlay.id = SCREENSHOT_OVERLAY_ID;
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "cursor:crosshair",
    "background:rgba(0,0,0,.12)",
    "user-select:none"
  ].join(";");

  selection.style.cssText = [
    "position:fixed",
    "display:none",
    "border:1px solid #ffffff",
    "background:rgba(255,255,255,.14)",
    "box-shadow:0 0 0 9999px rgba(0,0,0,.36),0 0 0 1px #CE123C inset",
    "pointer-events:none"
  ].join(";");

  hint.textContent = "Drag to select an area. Release to save PNG. Esc cancels.";
  hint.style.cssText = [
    "position:fixed",
    "top:16px",
    "left:50%",
    "transform:translateX(-50%)",
    "padding:10px 12px",
    "border-radius:8px",
    "background:#141717",
    "color:#fff",
    "font:600 13px system-ui,sans-serif",
    "box-shadow:0 10px 30px rgba(0,0,0,.22)"
  ].join(";");

  function removeOverlay() {
    window.removeEventListener("keydown", handleKeydown, true);
    overlay.remove();
  }

  function drawSelection(clientX: number, clientY: number) {
    const x = Math.min(startX, clientX);
    const y = Math.min(startY, clientY);
    const width = Math.abs(clientX - startX);
    const height = Math.abs(clientY - startY);

    currentRect = { x, y, width, height };
    selection.style.display = "block";
    selection.style.left = `${x}px`;
    selection.style.top = `${y}px`;
    selection.style.width = `${width}px`;
    selection.style.height = `${height}px`;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") removeOverlay();
  }

  overlay.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    startY = event.clientY;
    drawSelection(event.clientX, event.clientY);
    overlay.setPointerCapture(event.pointerId);
  });

  overlay.addEventListener("pointermove", (event) => {
    if (!overlay.hasPointerCapture(event.pointerId)) return;
    drawSelection(event.clientX, event.clientY);
  });

  overlay.addEventListener("pointerup", (event) => {
    if (!overlay.hasPointerCapture(event.pointerId)) return;
    overlay.releasePointerCapture(event.pointerId);

    const rectToCapture = { ...currentRect };
    removeOverlay();

    if (rectToCapture.width >= 8 && rectToCapture.height >= 8) {
      window.setTimeout(() => {
        chrome.runtime.sendMessage({
          type: "captureCrop",
          rect: {
            ...rectToCapture,
            devicePixelRatio: window.devicePixelRatio || 1
          }
        });
      }, 80);
    }
  });

  window.addEventListener("keydown", handleKeydown, true);
  overlay.append(selection, hint);
  document.documentElement.appendChild(overlay);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    if (message.type === "startAreaScreenshot") {
      startScreenshotSelection();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "inspectPageStorage") {
      sendResponse(await inspectPageStorage());
      return;
    }

    if (message.type === "clearPageStorageType") {
      sendResponse(await clearPageStorageType(message.storageType));
      return;
    }

    if (message.type === "clearPageStorage") {
      sendResponse(await clearPageStorage());
    }
  })();

  return true;
});

void chrome.runtime.sendMessage({ type: "getState" }, (state?: { enabled?: boolean; allowlist?: string[] }) => {
  if (chrome.runtime.lastError) return;
  if (isAllowlisted(state?.allowlist ?? [])) return;
  if (state?.enabled !== false) startCosmeticFiltering();
});
