export {};

type VideoFile = {
  url: string;
  tabId: number;
  tabUrl: string;
  filename?: string;
  size?: number;
  sizeFormatted?: string;
  contentType?: string;
  extension?: string;
  timestamp: number;
};

type ExtensionMessage =
  | { type: "getState" }
  | { type: "setEnabled"; enabled: boolean }
  | { type: "resetStats" }
  | { type: "incrementBlocked"; count: number; categories?: Record<string, number> }
  | { type: "captureCrop"; rect: CropRect }
  | { type: "captureCropToClipboard"; rect: CropRect }
  | { type: "inspectActiveTabStorage" }
  | { type: "clearActiveTabStorage" }
  | { type: "startCropScreenshot" }
  | { type: "captureVisibleScreenshot" }
  | { type: "captureFullPageScreenshot" }
  | { type: "clearStorageType"; storageType: StorageType }
  | { type: "getDetectedVideos" }
  | { type: "downloadVideo"; url: string; filename?: string }
  | { type: "clearDetectedVideos" }
  | { type: "reportVideoElement"; url: string }
  | { type: "reportVideoPlay"; url: string }
  | { type: "setActiveVideo"; url: string; filename?: string; contentType?: string }
  | { type: "injectPageScript" };

type StorageType =
  | "cookies"
  | "localStorage"
  | "sessionStorage"
  | "indexedDB"
  | "cacheStorage";

type ActiveVideoEntry = {
  url: string;
  filename?: string;
  contentType?: string;
  tabId: number;
  tabUrl: string;
  timestamp: number;
};

type StoredState = {
  enabled: boolean;
  blockedToday: number;
  allowlist: string[];
  detectedVideos: VideoFile[];
  activeVideos: ActiveVideoEntry[];
};

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
};

type PageStorageSnapshot = {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  indexedDB: string[];
  cacheStorage: string[];
};

type StorageSnapshot = PageStorageSnapshot & {
  url: string;
  cookies: chrome.cookies.Cookie[];
};

const DEFAULT_STATE: StoredState = {
  enabled: true,
  blockedToday: 0,
  allowlist: [],
  detectedVideos: [],
  activeVideos: [],
};

const ALLOWLIST_RULE_START_ID = 10000;
const pendingCaptures = new Map<number, string>();

const VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".mkv",
  ".flv",
  ".avi",
  ".mov",
  ".m4v",
  ".3gp",
  ".ogg",
  ".m3u8",
  ".mpd",
  ".ts",
  ".m4s",
  ".aac",
  ".mpeg",
  ".mpg",
  ".vtt",
];
const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-flv",
  "video/x-matroska",
];

function extractFilenameFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const lastSlash = pathname.lastIndexOf("/");
    const filename = pathname.slice(lastSlash + 1);
    return filename || undefined;
  } catch {
    return undefined;
  }
}

function isVideoUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  // Skip manifest.webmanifest, range requests, partial files, and google video previews
  if (
    lowerUrl.includes("manifest.webmanifest") ||
    lowerUrl.includes("range=") ||
    lowerUrl.includes("gstatic.com/video")
  ) {
    return false;
  }
  return (
    VIDEO_EXTENSIONS.some((ext) => lowerUrl.includes(ext)) ||
    VIDEO_MIME_TYPES.some((mime) => lowerUrl.includes(mime))
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return "Unknown size";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function getExtensionFromMimeType(mime: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes("mp4")) return "mp4";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("ogg")) return "ogv";
  if (lower.includes("quicktime") || lower.includes("mov")) return "mov";
  if (lower.includes("mpegurl") || lower.includes("m3u8")) return "m3u8";
  if (lower.includes("dash+xml") || lower.includes("mpd")) return "mpd";
  if (lower.includes("x-matroska") || lower.includes("mkv")) return "mkv";
  if (lower.includes("x-flv") || lower.includes("flv")) return "flv";
  if (lower.includes("x-msvideo") || lower.includes("avi")) return "avi";
  return "mp4"; // Default fallback
}

function getExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split(".");
    if (parts.length > 1) {
      const ext = parts[parts.length - 1].split(/[?#]/)[0].toLowerCase();
      if (ext.length >= 2 && ext.length <= 4) {
        return ext;
      }
    }
  } catch {}
  return "mp4";
}

async function getFriendlyFilename(tabId: number, url: string, contentType?: string): Promise<string> {
  let title = "video";
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.title) {
      // Clean tab title: strip standard suffixes like "- YouTube", etc.
      title = tab.title
        .replace(/\s*-\s*YouTube/i, "")
        .replace(/\s*\|\s*Netflix/i, "")
        .replace(/\s*-\s*Watch\s*Free\s*Videos\s*Online/i, "")
        .trim();
    }
  } catch (err) {
    console.error("Error getting tab info for filename:", err);
  }

  const ext = contentType ? getExtensionFromMimeType(contentType) : getExtensionFromUrl(url);
  const sanitized = sanitizeFilename(title);
  return sanitized ? `${sanitized}.${ext}` : `video-${Date.now()}.${ext}`;
}

async function fetchVideoHeaders(url: string): Promise<{ size?: number; contentType?: string } | null> {
  if (url.startsWith("blob:") || url.startsWith("data:")) return null;
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (response.ok) {
      const length = response.headers.get("content-length");
      const type = response.headers.get("content-type");
      return {
        size: length ? parseInt(length, 10) : undefined,
        contentType: type || undefined,
      };
    }
  } catch (err) {
    console.error("Failed to fetch HEAD for URL:", url, err);
  }
  return null;
}

async function addDetectedVideo(video: Omit<VideoFile, "timestamp">) {
  const state = await readState();

  // Deduplicate by URL within the same tab
  const existingIndex = state.detectedVideos.findIndex(
    (v) => v.tabId === video.tabId && v.url === video.url
  );
  if (existingIndex !== -1) {
    // If the new one has a size and the old one didn't, let's update it!
    if (video.size && !state.detectedVideos[existingIndex].size) {
      state.detectedVideos[existingIndex].size = video.size;
      state.detectedVideos[existingIndex].sizeFormatted = video.sizeFormatted;
      await setState({ detectedVideos: state.detectedVideos });
    }
    return;
  }

  // If the new video is a blob URL, check if we already have a real HTTP/HTTPS video URL for this tab.
  if (video.url.startsWith("blob:")) {
    const existingNonBlob = state.detectedVideos.find(
      (v) => v.tabId === video.tabId && !v.url.startsWith("blob:")
    );
    if (existingNonBlob) {
      return; // Keep the real downloadable URL instead of the blob
    }
  }

  // Filter out blob URLs if we are adding a real HTTP/HTTPS url
  let updatedVideos = state.detectedVideos;
  if (!video.url.startsWith("blob:")) {
    updatedVideos = state.detectedVideos.filter(
      (v) => !(v.tabId === video.tabId && v.url.startsWith("blob:"))
    );
  }

  // Limit the number of detected videos per tab to 15 to avoid bloated local storage
  const tabVideos = updatedVideos.filter((v) => v.tabId === video.tabId);
  if (tabVideos.length >= 15) {
    const oldest = tabVideos.reduce((min, v) => (v.timestamp < min.timestamp ? v : min), tabVideos[0]);
    updatedVideos = updatedVideos.filter((v) => v !== oldest);
  }

  const newVideo: VideoFile = {
    ...video,
    timestamp: Date.now(),
  };
  updatedVideos.push(newVideo);

  await setState({
    detectedVideos: updatedVideos,
  });
}

async function getActiveTabInfo() {
  const tab = await getActiveTab();
  return { tabId: tab.id!, tabUrl: tab.url! };
}

async function readState(): Promise<StoredState> {
  const stored = await chrome.storage.local.get(DEFAULT_STATE);
  return {
    enabled: Boolean(stored.enabled),
    blockedToday: Number(stored.blockedToday ?? 0),
    allowlist: Array.isArray(stored.allowlist) ? stored.allowlist : [],
    detectedVideos: Array.isArray(stored.detectedVideos)
      ? stored.detectedVideos
      : [],
    activeVideos: Array.isArray(stored.activeVideos)
      ? stored.activeVideos
      : [],
  };
}

function normalizeAllowlist(allowlist: string[]) {
  return allowlist
    .map((domain) =>
      domain
        .trim()
        .replace(/^www\./, "")
        .toLowerCase(),
    )
    .filter(Boolean);
}

async function syncAllowlistRules(allowlist: string[]) {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const oldRuleIds = existingRules
    .filter((rule) => rule.id >= ALLOWLIST_RULE_START_ID)
    .map((rule) => rule.id);

  const addRules: chrome.declarativeNetRequest.Rule[] = normalizeAllowlist(
    allowlist,
  ).map((domain, index) => ({
    id: ALLOWLIST_RULE_START_ID + index,
    priority: 100,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.ALLOW_ALL_REQUESTS,
    },
    condition: {
      requestDomains: [domain],
      resourceTypes: [
        chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
        chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
      ],
    },
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRuleIds,
    addRules,
  });
}

async function setRulesEnabled(enabled: boolean) {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enabled ? ["ads"] : [],
    disableRulesetIds: enabled ? [] : ["ads"],
  });
  await chrome.action.setBadgeBackgroundColor({
    color: enabled ? "#CE123C" : "#6b7280",
  });
  await chrome.action.setBadgeText({ text: "" });
}

async function setState(partial: Partial<StoredState>) {
  const next = { ...(await readState()), ...partial };
  await chrome.storage.local.set(next);
  await setRulesEnabled(next.enabled);
  await syncAllowlistRules(next.allowlist);
  return next;
}

function getActiveTab() {
  return chrome.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => {
      if (!tab?.id || !tab.url) throw new Error("No active tab found");
      return tab;
    });
}

async function injectContentScript(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

function sendTabMessageOnce<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  try {
    return await sendTabMessageOnce<T>(tabId, message);
  } catch {
    await injectContentScript(tabId);
    return sendTabMessageOnce<T>(tabId, message);
  }
}

function getCookieRemovalUrl(cookie: chrome.cookies.Cookie) {
  const protocol = cookie.secure ? "https:" : "http:";
  const domain = cookie.domain.replace(/^\./, "");
  return `${protocol}//${domain}${cookie.path}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(
        ...bytes.subarray(index, index + chunkSize),
      );
    }

    return `data:${blob.type};base64,${btoa(binary)}`;
  });
}

async function startCropScreenshot() {
  const tab = await getActiveTab();
  if (!tab.windowId) throw new Error("No active window found");

  const captureUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  pendingCaptures.set(tab.id!, captureUrl);
  await sendTabMessage<{ ok: true }>(tab.id!, { type: "startAreaScreenshot" });
  return { ok: true };
}

async function captureVisibleScreenshot() {
  const tab = await getActiveTab();
  if (!tab.windowId) throw new Error("No active window found");

  const captureUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  const filename = "swiss-blade.png";

  await chrome.downloads.download({
    url: captureUrl,
    filename,
    conflictAction: "uniquify",
    saveAs: true,
  });

  return { ok: true, filename };
}

async function captureFullPageScreenshot() {
  const tab = await getActiveTab();
  if (!tab.windowId || !tab.id) throw new Error("No active tab found");
  
  // Get page dimensions from content script
  let dimensions: {
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
    devicePixelRatio: number;
  };
  try {
    dimensions = await sendTabMessage<typeof dimensions>(tab.id, { type: "getPageDimensions" });
  } catch {
    // Fallback: if content script isn't available, just capture the visible viewport
    console.warn("[Swiss Blade] Content script not available, falling back to visible screenshot");
    return await captureVisibleScreenshot();
  }

  const { scrollHeight, clientHeight, devicePixelRatio: dpr } = dimensions;
  const viewportHeight = clientHeight || 1;
  const totalRows = Math.ceil(scrollHeight / viewportHeight);
  
  // Cap at 6 captures max to avoid service worker timeout and memory issues
  const maxCaptures = Math.min(totalRows, 6);
  
  const safeTitle = (tab.title || "page").replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "page";
  const filename = `${safeTitle.substring(0, 80)}.png`;

  // Collect captured image data URLs
  const captures: string[] = [];
  
  // Capture each row individually — a single failure doesn't abort the whole capture
  for (let row = 0; row < maxCaptures; row++) {
    const scrollY = Math.round(row * viewportHeight);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (y: number) => { window.scrollTo(0, y); },
        args: [scrollY],
        world: "MAIN",
      });
    } catch {
      // If scrolling fails (e.g., restricted page), fall back immediately
      console.warn("[Swiss Blade] Scroll failed on row " + row);
      return await captureVisibleScreenshot();
    }

    // Shorter delay between scroll and capture for speed
    await new Promise((r) => setTimeout(r, 150));
    
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "png",
      });
      captures.push(dataUrl);
    } catch (err) {
      console.warn("[Swiss Blade] Capture failed on row " + row, err);
      // Skip this row and continue with the next
      continue;
    }
  }
  
  // If no captures succeeded at all, fall back to visible screenshot
  if (captures.length === 0) {
    console.warn("[Swiss Blade] All captures failed, falling back to visible screenshot");
    return await captureVisibleScreenshot();
  }

  // Scroll back to top (best-effort)
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => { window.scrollTo(0, 0); },
    world: "MAIN",
  }).catch(() => {});

  // Stitch screenshots together using OffscreenCanvas
  const captureBlob = await fetch(captures[0]).then((r) => r.blob());
  const firstImage = await createImageBitmap(captureBlob);
  const captureWidth = firstImage.width;
  const totalCanvasHeight = Math.round(captures.length * viewportHeight * dpr);
  
  const canvas = new OffscreenCanvas(captureWidth, totalCanvasHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create stitching canvas");

  for (let i = 0; i < captures.length; i++) {
    const blob = await fetch(captures[i]).then((r) => r.blob());
    const img = await createImageBitmap(blob);
    const y = Math.round(i * viewportHeight * dpr);
    ctx.drawImage(img, 0, y);
  }

  const resultBlob = await canvas.convertToBlob({ type: "image/png" });
  const dataUrl = await blobToDataUrl(resultBlob);

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    conflictAction: "uniquify",
    saveAs: true,
  });

  return { ok: true, filename };
}

async function doCrop(
  rect: CropRect,
  captureUrl: string,
): Promise<{ cropBlob: Blob; dataUrl: string }> {
  const scale = Math.max(rect.devicePixelRatio || 1, 1);
  const captureBlob = await fetch(captureUrl).then((r) => r.blob());
  const image = await createImageBitmap(captureBlob);
  const sourceX = Math.max(0, Math.round(rect.x * scale));
  const sourceY = Math.max(0, Math.round(rect.y * scale));
  const sourceWidth = Math.max(1, Math.min(image.width - sourceX, Math.round(rect.width * scale)));
  const sourceHeight = Math.max(1, Math.min(image.height - sourceY, Math.round(rect.height * scale)));
  const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create crop canvas");
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  const cropBlob = await canvas.convertToBlob({ type: "image/png" });
  const dataUrl = await blobToDataUrl(cropBlob);
  return { cropBlob, dataUrl };
}

async function cropVisibleTab(
  rect: CropRect,
  sender: chrome.runtime.MessageSender,
) {
  const tab = sender.tab;
  if (!tab?.id) throw new Error("Screenshot must be started from a tab");

  const captureUrl = pendingCaptures.get(tab.id);
  pendingCaptures.delete(tab.id);
  if (!captureUrl)
    throw new Error("No pending screenshot found. Click Crop Shot again.");

  const { dataUrl } = await doCrop(rect, captureUrl);
  const filename = "swiss-blade.png";

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    conflictAction: "uniquify",
    saveAs: true,
  });

  return { ok: true, filename };
}

async function inspectActiveTabStorage(): Promise<StorageSnapshot> {
  const tab = await getActiveTab();
  const pageStorage = await sendTabMessage<PageStorageSnapshot>(tab.id!, {
    type: "inspectPageStorage",
  });
  const cookies = await chrome.cookies.getAll({ url: tab.url! });

  return {
    url: tab.url!,
    cookies,
    ...pageStorage,
  };
}

async function clearCookiesForTab(tab: chrome.tabs.Tab) {
  const cookies = await chrome.cookies.getAll({ url: tab.url! });

  await Promise.all(
    cookies.map((cookie) =>
      chrome.cookies.remove({
        url: getCookieRemovalUrl(cookie),
        name: cookie.name,
        storeId: cookie.storeId,
      }),
    ),
  );

  return cookies.length;
}

async function clearStorageType(storageType: StorageType) {
  const tab = await getActiveTab();

  if (storageType === "cookies") {
    return { ok: true, clearedCookies: await clearCookiesForTab(tab) };
  }

  const pageResult = await sendTabMessage<{ ok: true }>(tab.id!, {
    type: "clearPageStorageType",
    storageType,
  });
  return { ok: pageResult.ok, clearedCookies: 0 };
}

async function clearActiveTabStorage() {
  const tab = await getActiveTab();
  const clearedCookies = await clearCookiesForTab(tab);
  const pageResult = await sendTabMessage<{ ok: true }>(tab.id!, {
    type: "clearPageStorage",
  });
  return {
    ok: pageResult.ok,
    clearedCookies,
  };
}

async function downloadVideo(url: string, filename?: string) {
  // Handle HLS streams: fetch .m3u8, parse segments, download + concatenate
  if (url.includes(".m3u8") || filename?.endsWith(".m3u8")) {
    try {
      const result = await downloadHlsStream(url, filename);
      return result;
    } catch (err) {
      console.error("HLS download failed, falling back to direct download:", err);
      // Fall through to direct download
    }
  }

  const finalFilename =
    filename || extractFilenameFromUrl(url) || `video-${Date.now()}.mp4`;
  await chrome.downloads.download({
    url,
    filename: finalFilename,
    conflictAction: "uniquify",
    saveAs: true,
  });
  return { ok: true };
}

async function cropAndSendToClipboard(
  rect: CropRect,
  sender: chrome.runtime.MessageSender,
): Promise<{ ok: boolean; error?: string }> {
  const tab = sender.tab;
  if (!tab?.id) throw new Error("Screenshot must be started from a tab");

  const captureUrl = pendingCaptures.get(tab.id);
  pendingCaptures.delete(tab.id);
  if (!captureUrl)
    throw new Error("No pending screenshot found. Click Crop again.");

  const { dataUrl } = await doCrop(rect, captureUrl);

  // Send the cropped image data URL to the content script for clipboard copying
  await sendTabMessage(tab.id, { type: "copyImageToClipboard", dataUrl });

  return { ok: true };
}

async function downloadHlsStream(url: string, originalFilename?: string): Promise<{ ok: boolean; filename?: string; error?: string }> {
  // Fetch the HLS manifest
  const manifestResp = await fetch(url);
  if (!manifestResp.ok) throw new Error(`Failed to fetch HLS manifest: ${manifestResp.status}`);
  const manifestText = await manifestResp.text();

  // Parse .m3u8 manifest for segment URLs
  const segmentUrls: string[] = [];
  
  for (const line of manifestText.split("\n")) {
    const trimmed = line.trim();
    // Skip comments, tags, empty lines
    if (trimmed.startsWith("#") || trimmed === "") continue;
    // Resolve relative URLs properly
    const segmentUrl = new URL(trimmed, url).href;
    segmentUrls.push(segmentUrl);
  }

  if (segmentUrls.length === 0) {
    throw new Error("No video segments found in HLS manifest");
  }

  // Download all segments in parallel (with concurrency limit)
  const segments: ArrayBuffer[] = [];
  const CONCURRENCY = 6;
  for (let i = 0; i < segmentUrls.length; i += CONCURRENCY) {
    const batch = segmentUrls.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (segUrl) => {
        const resp = await fetch(segUrl);
        if (!resp.ok) throw new Error(`Failed to fetch segment: ${resp.status}`);
        return resp.arrayBuffer();
      })
    );
    segments.push(...results);
  }

  // Concatenate all segments into one blob
  const totalLength = segments.reduce((sum, buf) => sum + buf.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of segments) {
    combined.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  const blob = new Blob([combined], { type: "video/mp2t" });
  const dataUrl = await blobToDataUrl(blob);

  // Determine output filename
  const outputName = originalFilename
    ? originalFilename.replace(/\.m3u8$/i, ".ts")
    : `hls-stream-${Date.now()}.ts`;

  await chrome.downloads.download({
    url: dataUrl,
    filename: outputName,
    conflictAction: "uniquify",
    saveAs: true,
  });

  return { ok: true, filename: outputName };
}

chrome.runtime.onInstalled.addListener(async () => {
  const state = await readState();
  await chrome.storage.local.set({ ...DEFAULT_STATE, ...state, detectedVideos: [] });
  await setRulesEnabled(state.enabled);
  await syncAllowlistRules(state.allowlist);
});

chrome.runtime.onStartup.addListener(async () => {
  const state = await readState();
  await setState({ detectedVideos: [] });
  await setRulesEnabled(state.enabled);
  await syncAllowlistRules(state.allowlist);
});

// Clear video/active for tab when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    try {
      const state = await readState();
      const updatedVideos = state.detectedVideos.filter((v) => v.tabId !== tabId);
      const updatedActive = state.activeVideos.filter((v) => v.tabId !== tabId);
      await setState({ detectedVideos: updatedVideos, activeVideos: updatedActive });
    } catch (err) {
      console.error("Error updating state on tab remove:", err);
    }
  })();
});

// Clear video for tab when tab is navigated/reloaded
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    void (async () => {
      try {
        const state = await readState();
        const updatedVideos = state.detectedVideos.filter((v) => v.tabId !== tabId);
        const updatedActive = state.activeVideos.filter((v) => v.tabId !== tabId);
        await setState({ detectedVideos: updatedVideos, activeVideos: updatedActive });
      } catch (err) {
        console.error("Error updating state on tab update:", err);
      }
    })();
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.allowlist) return;
  void syncAllowlistRules(changes.allowlist.newValue ?? []);
});

// ── Page script that runs in MAIN world to intercept fetch/XHR/MSE ──
function injectMainWorldPageScript() {
  if ((window as any).__SB_VIDEO_DETECTOR__) return;
  (window as any).__SB_VIDEO_DETECTOR__ = true;

  const reported = new Set<string>();

  function post(type: string, data: any) {
    window.postMessage({ source: "swiss-blade-detector", type, data }, "*");
  }

  function isVideoContent(ct: string): boolean {
    return ct.startsWith("video/") ||
      ct.includes("application/x-mpegURL") ||
      ct.includes("application/vnd.apple.mpegurl") ||
      ct.includes("application/dash+xml");
  }

  function hasVideoExtension(url: string): boolean {
    const lower = url.toLowerCase();
    return /(\.mp4|\.webm|\.mkv|\.flv|\.avi|\.mov|\.m4v|\.3gp|\.ogg|\.m3u8|\.mpd|\.ts|\.m4s)/.test(lower);
  }

  function shouldReport(ct: string, url: string): boolean {
    if (isVideoContent(ct)) return true;
    if (ct.includes("octet-stream") && hasVideoExtension(url)) return true;
    if (ct === "" || ct === "application/octet-stream") return hasVideoExtension(url);
    return false;
  }

  function reportUrl(url: string, contentType: string, source: string) {
    if (!url || reported.has(url)) return;
    reported.add(url);
    post("video-detected", { url, contentType, source });
  }

  // 1. Patch fetch
  const origFetch = window.fetch.bind(window);
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
    return origFetch(input, init).then(function(resp: Response) {
      if (!resp || !resp.ok) return resp;
      const ct = resp.headers.get("content-type") || "";
      const url = typeof input === "string" ? input : (input instanceof Request ? input.url : resp.url);
      if (shouldReport(ct, url)) {
        reportUrl(url, ct, "fetch");
      }
      return resp;
    }).catch(function(e: any) { throw e; });
  };

  // 2. Patch XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open.bind(XMLHttpRequest.prototype);
  const origSend = XMLHttpRequest.prototype.send.bind(XMLHttpRequest.prototype);
  XMLHttpRequest.prototype.open = function(method: string, url: string | URL) {
    (this as any).__sbUrl = typeof url === "string" ? url : (url ? url.href || "" : "");
    return origOpen(method, url);
  };
  XMLHttpRequest.prototype.send = function() {
    const sbUrl = (this as any).__sbUrl;
    if (sbUrl) {
      this.addEventListener("load", function() {
        try {
          const ct = this.getResponseHeader("content-type") || "";
          if (shouldReport(ct, sbUrl) && sbUrl) {
            reportUrl(sbUrl, ct, "xhr");
          }
        } catch(e) {}
      });
    }
    return origSend();
  };

  // 3. Patch MediaSource
  const MediaSourceClass = (window as any).MediaSource;
  if (typeof MediaSourceClass !== "undefined" && MediaSourceClass.prototype && MediaSourceClass.prototype.addSourceBuffer) {
    const origAddSB = MediaSourceClass.prototype.addSourceBuffer.bind(MediaSourceClass.prototype);
    MediaSourceClass.prototype.addSourceBuffer = function(mimeType: string) {
      if (mimeType && mimeType.startsWith("video/")) {
        post("mse-video", { mimeType });
      }
      return origAddSB(mimeType);
    };
  }

  // 4. Watch for <source> elements
  document.addEventListener("DOMContentLoaded", function scanSources() {
    document.querySelectorAll("source[type*='video/']").forEach(function(s) {
      const src = (s as HTMLSourceElement).src;
      if (src && src.startsWith("http")) reportUrl(src, (s as HTMLSourceElement).type || "video/mp4", "source-tag");
    });
  });
  new MutationObserver(function() {
    document.querySelectorAll("source[type*='video/']").forEach(function(s) {
      const src = (s as HTMLSourceElement).src;
      if (src && src.startsWith("http") && !reported.has(src)) reportUrl(src, (s as HTMLSourceElement).type || "video/mp4", "source-tag");
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // 5. Also watch for <video> elements with direct src
  document.addEventListener("DOMContentLoaded", function scanVideos() {
    document.querySelectorAll("video[src]").forEach(function(v) {
      const src = (v as HTMLVideoElement).src;
      if (src && src.startsWith("http")) reportUrl(src, "video/mp4", "video-src");
    });
  });
  new MutationObserver(function() {
    document.querySelectorAll("video[src]").forEach(function(v) {
      const src = (v as HTMLVideoElement).src;
      if (src && src.startsWith("http") && !reported.has(src)) reportUrl(src, "video/mp4", "video-src");
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  post("ready", {});
}

// Listen for network requests to detect video files via headers
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId === -1) return;

    let contentType = "";
    let contentLength = 0;

    if (details.responseHeaders) {
      for (const header of details.responseHeaders) {
        const name = header.name.toLowerCase();
        if (name === "content-type") {
          contentType = header.value || "";
        } else if (name === "content-length") {
          contentLength = parseInt(header.value || "0", 10);
        }
      }
    }

    const lowerUrl = details.url.toLowerCase();
    
    // ── Skip byte-range (partial content) responses ──
    // Torrent/p2p streaming sites download video in chunks.
    // These show up as many duplicate entries — skip them.
    let isByteRange = false;
    let hasContentRange = false;
    if (details.responseHeaders) {
      for (const header of details.responseHeaders) {
        const name = header.name.toLowerCase();
        if (name === "content-range") {
          hasContentRange = true;
        }
      }
    }
    // If status is 206 Partial Content or has Content-Range, skip
    if (hasContentRange || details.statusCode === 206) {
      return;
    }

    // Remove size filter — catch any video-like response regardless of size.
    if (
      contentLength > 0 &&
      contentLength < 1024 &&
      !contentType.startsWith("video/") &&
      !contentType.includes("octet-stream")
    ) {
      return;
    }

    // Check if it's a video file or stream manifest
    const isVideo = 
      contentType.startsWith("video/") ||
      contentType.includes("application/x-mpegURL") ||
      contentType.includes("application/vnd.apple.mpegurl") ||
      contentType.includes("application/dash+xml") ||
      isVideoUrl(details.url);

    if (isVideo) {
      void (async () => {
        try {
          const tab = await chrome.tabs.get(details.tabId);
          if (tab?.url) {
            const filename = await getFriendlyFilename(details.tabId, details.url, contentType);
            await addDetectedVideo({
              url: details.url,
              tabId: details.tabId,
              tabUrl: tab.url,
              filename,
              size: contentLength || undefined,
              sizeFormatted: contentLength ? formatBytes(contentLength) : undefined,
              contentType: contentType || undefined,
              extension: contentType ? getExtensionFromMimeType(contentType) : getExtensionFromUrl(details.url),
            });
          }
        } catch (err) {
          console.error("Error adding video from headers:", err);
        }
      })();
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);


chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    void (async () => {
      if (message.type === "getState") {
        sendResponse(await readState());
        return;
      }

      if (message.type === "setEnabled") {
        sendResponse(await setState({ enabled: message.enabled }));
        return;
      }

      if (message.type === "resetStats") {
        sendResponse(await setState({ blockedToday: 0 }));
        return;
      }

      if (message.type === "incrementBlocked") {
        const state = await readState();
        if (!state.enabled || message.count <= 0) {
          sendResponse(state);
          return;
        }

        const blockedToday = state.blockedToday + message.count;
        await chrome.storage.local.set({ blockedToday });
        await chrome.action.setBadgeBackgroundColor({ color: "#CE123C" });
        await chrome.action.setBadgeText({
          text: String(Math.min(blockedToday, 999)),
        });
        
        // Store ad category breakdown for the popup
        if (message.categories) {
          await chrome.storage.local.set({ adCategories: message.categories });
        }
        
        sendResponse({ ...state, blockedToday });
        return;
      }

      if (message.type === "startCropScreenshot") {
        sendResponse(await startCropScreenshot());
        return;
      }

      if (message.type === "captureVisibleScreenshot") {
        sendResponse(await captureVisibleScreenshot());
        return;
      }

      if (message.type === "captureFullPageScreenshot") {
        sendResponse(await captureFullPageScreenshot());
        return;
      }

      if (message.type === "captureCrop") {
        sendResponse(await cropVisibleTab(message.rect, sender));
        return;
      }

      if (message.type === "captureCropToClipboard" && sender.tab?.id) {
        try {
          const result = await cropAndSendToClipboard(message.rect, sender);
          sendResponse(result);
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : "Crop failed" });
        }
        return;
      }

      if (message.type === "inspectActiveTabStorage") {
        sendResponse(await inspectActiveTabStorage());
        return;
      }

      if (message.type === "clearStorageType") {
        sendResponse(await clearStorageType(message.storageType));
        return;
      }

      if (message.type === "clearActiveTabStorage") {
        sendResponse(await clearActiveTabStorage());
      }

      if (message.type === "injectPageScript" && sender.tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          world: "MAIN",
          func: injectMainWorldPageScript as any,
        }).catch((err) => {
          // Some pages may block injection — that's OK, webRequest fallback works
          console.warn("Could not inject page script (tab may lack permissions):", err);
        });
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "getDetectedVideos") {
        const state = await readState();
        let tabId: number | undefined;
        if (sender.tab?.id) {
          tabId = sender.tab.id;
        } else {
          try { tabId = (await getActiveTab()).id; } catch {}
        }
        let activeVideo = tabId
          ? state.activeVideos.find((v) => v.tabId === tabId)
          : undefined;
        const videos = tabId
          ? state.detectedVideos.filter((v) => v.tabId === tabId)
          : state.detectedVideos;
        
        // Fallback: if no activeVideo but detectedVideos exist, use the latest one
        if (!activeVideo && videos.length > 0) {
          const latest = videos.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
          activeVideo = {
            url: latest.url,
            filename: latest.filename,
            contentType: latest.contentType,
            tabId: latest.tabId,
            tabUrl: latest.tabUrl,
            timestamp: latest.timestamp,
          };
        }

        // Try to find size info for the active video from the detected videos list
        let activeSizeFormatted: string | undefined;
        if (activeVideo) {
          const matchingDetected = videos.find(v => v.url === activeVideo!.url);
          if (matchingDetected?.sizeFormatted) {
            activeSizeFormatted = matchingDetected.sizeFormatted;
          }
          // If no size yet, try a HEAD request in the background
          if (!matchingDetected?.size) {
            try {
              const headInfo = await fetchVideoHeaders(activeVideo.url);
              if (headInfo?.size) {
                activeSizeFormatted = formatBytes(headInfo.size);
              }
            } catch {}
          }
        }

        sendResponse({ videos, activeVideo, activeSizeFormatted });
      }

      if (message.type === "downloadVideo") {
        sendResponse(await downloadVideo(message.url, message.filename));
      }

      if (message.type === "clearDetectedVideos") {
        await setState({ detectedVideos: [], activeVideos: [] });
        sendResponse({ ok: true });
      }

      if (message.type === "setActiveVideo") {
        if (sender.tab?.id && sender.tab?.url) {
          const state = await readState();
          const existing = state.activeVideos.findIndex(
            (v) => v.tabId === sender.tab!.id && v.url === message.url
          );
          if (existing !== -1) {
            state.activeVideos[existing].timestamp = Date.now();
          } else {
            state.activeVideos.push({
              url: message.url,
              filename: message.filename,
              contentType: message.contentType,
              tabId: sender.tab.id,
              tabUrl: sender.tab.url,
              timestamp: Date.now(),
            });
          }
          // Keep only the most recent active video per tab, remove old ones
          const tabActive = state.activeVideos
            .filter((v) => v.tabId === sender.tab!.id)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 1);
          const otherActive = state.activeVideos.filter((v) => v.tabId !== sender.tab!.id);
          await setState({ activeVideos: [...otherActive, ...tabActive] });
        }
        sendResponse({ ok: true });
      }

      if (message.type === "reportVideoElement") {
        if (sender.tab?.id && sender.tab?.url) {
          void (async () => {
            try {
              const headers = await fetchVideoHeaders(message.url);
              const size = headers?.size;
              const contentType = headers?.contentType;
              const filename = await getFriendlyFilename(sender.tab!.id!, message.url, contentType);
              await addDetectedVideo({
                url: message.url,
                tabId: sender.tab!.id!,
                tabUrl: sender.tab!.url!,
                filename,
                size,
                sizeFormatted: size ? formatBytes(size) : undefined,
                contentType,
                extension: contentType ? getExtensionFromMimeType(contentType) : getExtensionFromUrl(message.url),
              });
            } catch (err) {
              console.error("Error reporting video element:", err);
            }
          })();
        }
        sendResponse({ ok: true });
      }

      if (message.type === "reportVideoPlay") {
        if (sender.tab?.id && sender.tab?.url) {
          void (async () => {
            try {
              const headers = await fetchVideoHeaders(message.url);
              const size = headers?.size;
              const contentType = headers?.contentType;
              const filename = await getFriendlyFilename(sender.tab!.id!, message.url, contentType);
              await addDetectedVideo({
                url: message.url,
                tabId: sender.tab!.id!,
                tabUrl: sender.tab!.url!,
                filename,
                size,
                sizeFormatted: size ? formatBytes(size) : undefined,
                contentType,
                extension: contentType ? getExtensionFromMimeType(contentType) : getExtensionFromUrl(message.url),
              });
            } catch (err) {
              console.error("Error reporting video play:", err);
            }
          })();
        }
        sendResponse({ ok: true });
      }
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });

    return true;
  },
);
