export {};

// ═══════════════════════════════════════════════════════
// PAGE SCRIPT — injected via background (chrome.scripting.executeScript)
// to bypass page CSP and intercept fetch/XHR/MediaSource
// ═══════════════════════════════════════════════════════

function safeSendMessage(message: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        try {
          if (chrome.runtime.lastError) {
            resolve(undefined);
            return;
          }
          resolve(response);
        } catch {
          resolve(undefined);
        }
      });
    } catch {
      resolve(undefined);
    }
  });
}

function requestPageScriptInjection() {
  safeSendMessage({ type: "injectPageScript" }).then((result) => {
    if (!result) {
      // Background might not be ready yet; retry once
      setTimeout(() => {
        safeSendMessage({ type: "injectPageScript" });
      }, 500);
    }
  });
}

// ═══════════════════════════════════════════════════════
// FLOATING DOWNLOAD BUTTON
// ═══════════════════════════════════════════════════════

const DOWNLOAD_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const CLOSE_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

let floatingBtn: HTMLDivElement | null = null;
let activeVideoElement: HTMLVideoElement | null = null;
let hideTimeout: number | undefined;
const watchedVideos = new WeakSet<HTMLVideoElement>();

// The best video URL detected for this page — updated by MSE/fetch/XHR interception
let bestVideoUrl: string | null = null;
let bestVideoContentType: string | null = null;
let bestVideoFilename: string | null = null;

function triggerHideTimeout() {
  if (hideTimeout) clearTimeout(hideTimeout);
  hideTimeout = window.setTimeout(() => {
    if (floatingBtn) {
      floatingBtn.classList.remove("show");
    }
  }, 2000);
}

function ensureFloatingButtonCreated() {
  if (document.getElementById("swiss-blade-video-downloader")) {
    floatingBtn = document.getElementById("swiss-blade-video-downloader") as HTMLDivElement;
    return;
  }

  const style = document.createElement("style");
  style.id = "swiss-blade-floating-downloader-styles";
  style.textContent = `
    #swiss-blade-video-downloader {
      position: fixed !important;
      z-index: 2147483640;
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      user-select: none;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease, bottom 0.2s ease;
      transform: translateY(8px);
      bottom: 16px;
      right: 16px;
      left: auto !important;
      top: auto !important;
    }
    #swiss-blade-video-downloader.show {
      opacity: 1;
      transform: translateY(0);
    }
    .sb-download-trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #CE123C;
      border: none;
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
      padding: 10px 16px;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(206, 18, 60, 0.4);
      transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
      line-height: 1;
      white-space: nowrap;
    }
    .sb-download-trigger:hover {
      background: #e11d48;
      transform: scale(1.03);
      box-shadow: 0 6px 20px rgba(206, 18, 60, 0.5);
    }
    .sb-download-trigger:active {
      transform: scale(0.97);
    }
    .sb-download-trigger .sb-filename {
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
      font-size: 12px;
      opacity: 0.85;
    }
    .sb-download-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      background: rgba(255,255,255,0.15);
      border-radius: 50%;
      cursor: pointer;
      color: #fff;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .sb-download-close:hover {
      background: rgba(255,255,255,0.3);
    }
  `;
  document.head.appendChild(style);

  floatingBtn = document.createElement("div");
  floatingBtn.id = "swiss-blade-video-downloader";

  const trigger = document.createElement("button");
  trigger.className = "sb-download-trigger";
  trigger.type = "button";
  trigger.innerHTML = `${DOWNLOAD_SVG}<span>Download</span><span class="sb-filename">Video</span>`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "sb-download-close";
  closeBtn.type = "button";
  closeBtn.innerHTML = CLOSE_SVG;
  closeBtn.title = "Dismiss";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (floatingBtn) {
      floatingBtn.classList.remove("show");
      bestVideoUrl = null;
      bestVideoFilename = null;
    }
  });

  trigger.appendChild(closeBtn);
  floatingBtn.appendChild(trigger);

  trigger.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".sb-download-close")) return;
    if (bestVideoUrl) {
      safeSendMessage({
        type: "downloadVideo",
        url: bestVideoUrl,
        filename: bestVideoFilename || undefined
      });
      floatingBtn?.classList.remove("show");
    }
  });

  document.body.appendChild(floatingBtn);
}

function updateFloatingButton() {
  if (!bestVideoUrl) {
    if (floatingBtn) floatingBtn.classList.remove("show");
    return;
  }

  ensureFloatingButtonCreated();
  const btn = floatingBtn!.querySelector(".sb-download-trigger") as HTMLButtonElement;
  const label = btn.querySelector(".sb-filename") as HTMLSpanElement;
  label.textContent = bestVideoFilename || "Video";
  floatingBtn!.classList.add("show");
}

// ═══════════════════════════════════════════════════════
// VIDEO ELEMENT TRACKING
// ═══════════════════════════════════════════════════════

function getVideoBestSrc(video: HTMLVideoElement): string | null {
  if (video.src && video.src.startsWith("http")) return video.src;
  const source = video.querySelector("source");
  if (source && source.src && source.src.startsWith("http")) return source.src;
  if (video.src && video.src.startsWith("blob:")) return video.src; // Report blob URL too
  return null;
}

function guessFilenameFromSrc(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname.split("/").pop() || "";
    if (p && p.includes(".")) return decodeURIComponent(p);
  } catch {}
  return "video.mp4";
}

function watchVideo(video: HTMLVideoElement) {
  if (watchedVideos.has(video)) return;
  watchedVideos.add(video);

  let isPlaying = false;

  video.addEventListener("mouseenter", () => {
    activeVideoElement = video;
  });

  video.addEventListener("play", () => {
    isPlaying = true;
    activeVideoElement = video;
    const src = getVideoBestSrc(video);
    if (src) {
      bestVideoUrl = src;
      bestVideoFilename = guessFilenameFromSrc(src);
      updateFloatingButton();
      reportActiveVideoToBackground(src);
    }
  });

  video.addEventListener("pause", () => {
    isPlaying = false;
  });

  video.addEventListener("loadedmetadata", () => {
    if (!isPlaying) return;
    const src = getVideoBestSrc(video);
    if (src && src !== bestVideoUrl) {
      bestVideoUrl = src;
      bestVideoFilename = guessFilenameFromSrc(src);
      updateFloatingButton();
      reportActiveVideoToBackground(src);
    }
  });

  // Current source may be set after element creation
  const src = getVideoBestSrc(video);
  if (src && src.startsWith("http")) {
    bestVideoUrl = src;
    bestVideoFilename = guessFilenameFromSrc(src);
    updateFloatingButton();
  }
}

async function scanForVideoElements() {
  const videos = document.querySelectorAll("video");
  for (const video of videos) {
    watchVideo(video);
  }
}

// ═══════════════════════════════════════════════════════
// REPORTING TO BACKGROUND
// ═══════════════════════════════════════════════════════

function reportActiveVideoToBackground(url: string) {
  safeSendMessage({
    type: "setActiveVideo",
    url: url,
    filename: bestVideoFilename || guessFilenameFromSrc(url),
    contentType: bestVideoContentType || undefined
  });
}

// ═══════════════════════════════════════════════════════
// LISTEN FOR PAGE SCRIPT MESSAGES (MSE / fetch / XHR)
// ═══════════════════════════════════════════════════════

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== "swiss-blade-detector") return;

  const { type, data } = event.data;

  if (type === "video-detected" && data?.url) {
    const url = data.url;
    if (url.startsWith("http")) {
      bestVideoUrl = url;
      bestVideoContentType = data.contentType || null;
      bestVideoFilename = guessFilenameFromSrc(url);
      updateFloatingButton();
      reportActiveVideoToBackground(url);
    }
  }

  if (type === "mse-video" && data?.mimeType) {
    // MediaSource detected with video MIME — the extension will
    // also catch the underlying segment fetches via the fetch/XHR patches
    console.log("[Swiss Blade] MSE video detected:", data.mimeType);
  }
});

// ═══════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════

// Inject page script into main world via background (bypasses CSP)
requestPageScriptInjection();

void scanForVideoElements();

const observer = new MutationObserver(() => {
  void scanForVideoElements();
});
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

type StorageType = "localStorage" | "sessionStorage" | "indexedDB" | "cacheStorage";

type AdCategory = { selector: string; category: string };

const AD_RULES: AdCategory[] = [
  { selector: "ins.adsbygoogle", category: "Google" },
  { selector: "[id^=\"ad-\"]", category: "Banner" },
  { selector: "[id^=\"ads-\"]", category: "Banner" },
  { selector: "[id*=\"-ad-\"]", category: "Banner" },
  { selector: "[id*=\"_ad_\"]", category: "Banner" },
  { selector: "[id*=\"ads_\"]", category: "Banner" },
  { selector: "[id*=\"ad_container\" i]", category: "Banner" },
  { selector: "[id*=\"ad-container\" i]", category: "Banner" },
  { selector: "[id*=\"ad_wrapper\" i]", category: "Banner" },
  { selector: "[id*=\"ad-wrapper\" i]", category: "Banner" },
  { selector: "[id*=\"google_ads\" i]", category: "Google" },
  { selector: "[id*=\"google_ads_iframe\" i]", category: "Google" },
  { selector: "[id*=\"banner-ad\" i]", category: "Banner" },
  { selector: "[id*=\"sponsor\" i]", category: "Sponsored" },
  { selector: "[class^=\"ad-\"]", category: "Banner" },
  { selector: "[class*=\" ad-\"]", category: "Banner" },
  { selector: "[class*=\"_ad_\"]", category: "Banner" },
  { selector: "[class*=\"-ad-\"]", category: "Banner" },
  { selector: "[class*=\" ads\" i]", category: "Banner" },
  { selector: "[class*=\"ad-container\" i]", category: "Banner" },
  { selector: "[class*=\"ad_container\" i]", category: "Banner" },
  { selector: "[class*=\"ad-wrapper\" i]", category: "Banner" },
  { selector: "[class*=\"ad_wrapper\" i]", category: "Banner" },
  { selector: "[class*=\"ad-slot\" i]", category: "Banner" },
  { selector: "[class*=\"ad_slot\" i]", category: "Banner" },
  { selector: "[class*=\"adbox\" i]", category: "Banner" },
  { selector: "[class*=\"adsbox\" i]", category: "Banner" },
  { selector: "[class*=\"adsbygoogle\" i]", category: "Google" },
  { selector: "[class*=\"advert\" i]", category: "Banner" },
  { selector: "[class*=\"sponsor\" i]", category: "Sponsored" },
  { selector: "[class*=\"promoted\" i]", category: "Sponsored" },
  { selector: "[class*=\"native-ad\" i]", category: "Native" },
  { selector: "[data-ad]", category: "Banner" },
  { selector: "[data-ad-slot]", category: "Banner" },
  { selector: "[data-ad-client]", category: "Banner" },
  { selector: "[data-ad-unit]", category: "Banner" },
  { selector: "[data-ad-format]", category: "Banner" },
  { selector: "[data-google-query-id]", category: "Google" },
  { selector: "[data-testid*=\"ad\" i]", category: "Banner" },
  { selector: "[data-testid*=\"sponsor\" i]", category: "Sponsored" },
  { selector: "[aria-label*=\"advertisement\" i]", category: "Banner" },
  { selector: "[aria-label*=\"sponsored\" i]", category: "Sponsored" },
  { selector: "iframe[id^=\"google_ads_iframe\"]", category: "Iframe" },
  { selector: "iframe[src*=\"doubleclick.net\"]", category: "Iframe" },
  { selector: "iframe[src*=\"googlesyndication.com\"]", category: "Iframe" },
  { selector: "iframe[src*=\"adservice.google.com\"]", category: "Iframe" },
  { selector: "iframe[src*=\"adsystem.com\"]", category: "Iframe" },
  { selector: "iframe[src*=\"adnxs.com\"]", category: "Iframe" },
  { selector: "iframe[src*=\"amazon-adsystem.com\"]", category: "Iframe" },
  { selector: "iframe[src*=\"outbrain.com\"]", category: "Iframe" },
  { selector: "iframe[src*=\"taboola.com\"]", category: "Iframe" },
  { selector: "iframe[src*=\"criteo.com\"]", category: "Iframe" },
  { selector: "iframe[src*=\"pubmatic.com\"]", category: "Iframe" },
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
  const selectors = AD_RULES.map((r) => r.selector).join(",");
  style.textContent = `${selectors}{display:none!important;visibility:hidden!important;min-height:0!important;}`;
  document.documentElement.appendChild(style);
}

let pendingCategories: Record<string, number> = {};

function reportHiddenCount(count: number, categories: Record<string, number> = {}) {
  if (count <= 0) return;

  pendingHiddenCount += count;
  // Merge category counts
  for (const [cat, catCount] of Object.entries(categories)) {
    pendingCategories[cat] = (pendingCategories[cat] || 0) + catCount;
  }

  if (reportTimer) return;

  reportTimer = window.setTimeout(() => {
    const countToReport = pendingHiddenCount;
    const catsToReport = { ...pendingCategories };
    pendingHiddenCount = 0;
    pendingCategories = {};
    reportTimer = undefined;
    safeSendMessage({ type: "incrementBlocked", count: countToReport, categories: catsToReport });
  }, REPORT_DELAY_MS);
}

function collapseAds(root: ParentNode = document) {
  let hiddenCount = 0;
  const categoryCounts: Record<string, number> = {};

  for (const rule of AD_RULES) {
    const nodes = root.querySelectorAll<HTMLElement>(rule.selector);
    let ruleCount = 0;
    for (const node of nodes) {
      if (node.dataset.swissBladeHidden === "true") continue;
      node.style.setProperty("display", "none", "important");
      node.style.setProperty("visibility", "hidden", "important");
      node.setAttribute("data-swiss-blade-hidden", "true");
      ruleCount += 1;
    }
    if (ruleCount > 0) {
      categoryCounts[rule.category] = (categoryCounts[rule.category] || 0) + ruleCount;
      hiddenCount += ruleCount;
    }
  }

  reportHiddenCount(hiddenCount, categoryCounts);
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
    
    if (rectToCapture.width >= 8 && rectToCapture.height >= 8) {
      // Show action buttons instead of immediately capturing
      showCropActions(rectToCapture, overlay, hint, selection);
    } else {
      removeOverlay();
    }
  });

  function showCropActions(
    rect: typeof currentRect,
    overlayEl: HTMLDivElement,
    hintEl: HTMLDivElement,
    selectionEl: HTMLDivElement
  ) {
    // Clear selection box and hint, show action buttons
    selectionEl.style.display = "none";
    hintEl.remove();
    overlayEl.style.cursor = "default";
    overlayEl.style.background = "rgba(0,0,0,.45)";

    const actionsContainer = document.createElement("div");
    actionsContainer.style.cssText = [
      "position:fixed",
      "top:50%",
      "left:50%",
      "transform:translate(-50%,-50%)",
      "display:flex",
      "gap:12px",
      "z-index:2147483647",
      "animation:sbFadeIn 0.15s ease-out",
    ].join(";");

    // Inject animation keyframes
    if (!document.getElementById("sb-crop-anim")) {
      const animStyle = document.createElement("style");
      animStyle.id = "sb-crop-anim";
      animStyle.textContent = `@keyframes sbFadeIn { from { opacity:0; transform:translate(-50%,-50%) scale(0.95); } to { opacity:1; transform:translate(-50%,-50%) scale(1); } }`;
      document.head.appendChild(animStyle);
    }

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "💾 Save";
    saveBtn.style.cssText = [
      "padding:10px 20px",
      "border:none",
      "border-radius:8px",
      "background:#CE123C",
      "color:#fff",
      "font:700 14px system-ui,sans-serif",
      "cursor:pointer",
      "box-shadow:0 4px 12px rgba(0,0,0,.3)",
      "transition:transform 0.1s",
    ].join(";");
    saveBtn.addEventListener("mouseenter", () => { saveBtn.style.transform = "scale(1.05)"; });
    saveBtn.addEventListener("mouseleave", () => { saveBtn.style.transform = "scale(1)"; });
    function cleanupAndCapture(action: "save" | "copy") {
      removeOverlay();
      safeSendMessage({
        type: action === "save" ? "captureCrop" : "captureCropToClipboard",
        rect: { ...rect, devicePixelRatio: window.devicePixelRatio || 1 },
      });
    }

    saveBtn.addEventListener("click", () => cleanupAndCapture("save"));

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋 Copy";
    copyBtn.style.cssText = [
      "padding:10px 20px",
      "border:1px solid rgba(255,255,255,.3)",
      "border-radius:8px",
      "background:rgba(20,23,23,.85)",
      "color:#fff",
      "font:700 14px system-ui,sans-serif",
      "cursor:pointer",
      "box-shadow:0 4px 12px rgba(0,0,0,.3)",
      "backdrop-filter:blur(8px)",
      "transition:transform 0.1s",
    ].join(";");
    copyBtn.addEventListener("mouseenter", () => { copyBtn.style.transform = "scale(1.05)"; });
    copyBtn.addEventListener("mouseleave", () => { copyBtn.style.transform = "scale(1)"; });
    copyBtn.addEventListener("click", () => cleanupAndCapture("copy"));

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "✕ Cancel";
    cancelBtn.style.cssText = [
      "padding:10px 20px",
      "border:none",
      "border-radius:8px",
      "background:rgba(255,255,255,.1)",
      "color:rgba(255,255,255,.7)",
      "font:600 14px system-ui,sans-serif",
      "cursor:pointer",
    ].join(";");
    cancelBtn.addEventListener("click", () => {
      removeOverlay();
    });

    actionsContainer.append(saveBtn, copyBtn, cancelBtn);
    overlayEl.appendChild(actionsContainer);
  }

  window.addEventListener("keydown", handleKeydown, true);
  overlay.append(selection, hint);
  document.documentElement.appendChild(overlay);
}

async function copyImageToClipboard(dataUrl: string) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    // Show brief success toast
    const toast = document.createElement("div");
    toast.textContent = "✅ Copied to clipboard!";
    toast.style.cssText = [
      "position:fixed",
      "bottom:24px",
      "left:50%",
      "transform:translateX(-50%)",
      "z-index:2147483647",
      "padding:10px 18px",
      "border-radius:8px",
      "background:#141717",
      "color:#fff",
      "font:600 13px system-ui,sans-serif",
      "box-shadow:0 4px 16px rgba(0,0,0,.3)",
      "animation:sbToastIn 0.2s ease-out",
    ].join(";");
    // Add animation keyframes if not present
    if (!document.getElementById("sb-toast-style")) {
      const s = document.createElement("style");
      s.id = "sb-toast-style";
      s.textContent = `@keyframes sbToastIn { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
      document.head.appendChild(s);
    }
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 2000);
  } catch (err) {
    console.error("[Swiss Blade] Failed to copy to clipboard:", err);
  }
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

    if (message.type === "getPageDimensions") {
      sendResponse({
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
      });
    }

    if (message.type === "copyImageToClipboard" && message.dataUrl) {
      await copyImageToClipboard(message.dataUrl);
      sendResponse({ ok: true });
    }
  })();

  return true;
});

safeSendMessage({ type: "getState" }).then((state: any) => {
  if (!state) return;
  if (isAllowlisted(state.allowlist ?? [])) return;
  if (state.enabled !== false) startCosmeticFiltering();
});
