export {};

type ShieldState = {
  enabled: boolean;
  blockedToday: number;
};

type StorageType =
  | "cookies"
  | "localStorage"
  | "sessionStorage"
  | "indexedDB"
  | "cacheStorage";

type StorageSnapshot = {
  url: string;
  cookies: chrome.cookies.Cookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  indexedDB: string[];
  cacheStorage: string[];
  ok?: boolean;
  error?: string;
};

type ActiveVideoEntry = {
  url: string;
  filename?: string;
  contentType?: string;
  tabId: number;
  tabUrl: string;
  timestamp: number;
};

const DEFAULT_STATE: ShieldState = {
  enabled: true,
  blockedToday: 0,
};

const elements = {
  protectionLabel:
    document.querySelector<HTMLHeadingElement>("#protectionLabel")!,
  toggleProtection:
    document.querySelector<HTMLButtonElement>("#toggleProtection")!,
  powerIcon: document.querySelector<HTMLElement>("#powerIcon")!,
  blockedToday: document.querySelector<HTMLElement>("#blockedToday")!,
  statusDot: document.querySelector<HTMLElement>("#statusDot")!,
  statusText: document.querySelector<HTMLElement>("#statusText")!,
  adCategories: document.querySelector<HTMLElement>("#adCategories")!,
  screenshotBtn: document.querySelector<HTMLButtonElement>("#screenshotBtn")!,
  screenshotDropdown: document.querySelector<HTMLElement>("#screenshotDropdown")!,
  cropShot: document.querySelector<HTMLButtonElement>("#cropShot")!,
  cropScreenshot: document.querySelector<HTMLButtonElement>("#cropScreenshot")!,
  fullPageShot: document.querySelector<HTMLButtonElement>("#fullPageShot")!,
  inspectStorage: document.querySelector<HTMLButtonElement>("#inspectStorage")!,
  clearStorage: document.querySelector<HTMLButtonElement>("#clearStorage")!,
  resetStats: document.querySelector<HTMLButtonElement>("#resetStats")!,
  storagePanel: document.querySelector<HTMLElement>("#storagePanel")!,
  storageSummary: document.querySelector<HTMLElement>("#storageSummary")!,
  storageDetails: document.querySelector<HTMLElement>("#storageDetails")!,
  videoSection: document.querySelector<HTMLElement>("#videoSection")!,
  videoNowPlaying: document.querySelector<HTMLElement>("#videoNowPlaying")!,
  videoEmpty: document.querySelector<HTMLElement>("#videoEmpty")!,
  videoActiveName: document.querySelector<HTMLElement>("#videoActiveName")!,
  videoActiveFormat: document.querySelector<HTMLElement>("#videoActiveFormat")!,
  videoActiveSize: document.querySelector<HTMLElement>("#videoActiveSize")!,
  videoStartDownload:
    document.querySelector<HTMLButtonElement>("#videoStartDownload")!,
  videoRefreshBtn:
    document.querySelector<HTMLButtonElement>("#videoRefreshBtn")!,
  videoMoreList: document.querySelector<HTMLElement>("#videoMoreList")!,
  videoMoreToggle:
    document.querySelector<HTMLButtonElement>("#videoMoreToggle")!,
};

let state: ShieldState = DEFAULT_STATE;
let latestSnapshot: StorageSnapshot | null = null;
let expandedStorageType: StorageType | null = null;
let videoRefreshInterval: number | null = null;
let activeVideo: ActiveVideoEntry | null = null;
let allDetectedVideos: any[] = [];
let showingMoreVideos = false;
let storagePanelOpen = false;

function setStatus(message: string) {
  elements.statusText.textContent = message;
}

function objectCount(value: Record<string, string>) {
  return Object.keys(value).length;
}

function trimValue(value: string) {
  return value.length > 80 ? `${value.slice(0, 80)}...` : value;
}

async function loadAdCategories() {
  const { adCategories } = await chrome.storage.local.get("adCategories");
  if (adCategories && Object.keys(adCategories).length > 0) {
    const entries = Object.entries(adCategories) as [string, number][];
    // Sort by count descending
    entries.sort((a, b) => b[1] - a[1]);
    elements.adCategories.innerHTML = entries
      .map(([cat, count]) => `<span class="ad-cat-badge">${cat}: ${count}</span>`)
      .join("");
    elements.adCategories.hidden = false;
  } else {
    elements.adCategories.hidden = true;
  }
}

function renderState() {
  elements.protectionLabel.textContent = state.enabled
    ? "Blocking ads"
    : "Paused";
  elements.toggleProtection.classList.toggle("is-on", state.enabled);
  elements.toggleProtection.classList.toggle("is-off", !state.enabled);
  elements.powerIcon.textContent = state.enabled ? "ON" : "OFF";
  elements.statusDot.classList.toggle("on", state.enabled);
  elements.blockedToday.textContent = String(state.blockedToday);
  void loadAdCategories();
}

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function readState() {
  const stored = await chrome.storage.local.get(["enabled", "blockedToday"]);
  state = {
    enabled: Boolean(stored.enabled ?? true),
    blockedToday: Number(stored.blockedToday ?? 0),
  };
  renderState();
  setStatus(state.enabled ? "Protection active" : "Protection paused");
}

async function toggleProtection() {
  const nextEnabled = !state.enabled;
  const result = await sendMessage<ShieldState>({
    type: "setEnabled",
    enabled: nextEnabled,
  });
  state = {
    enabled: Boolean(result.enabled),
    blockedToday: Number(result.blockedToday ?? 0),
  };
  renderState();
  setStatus(state.enabled ? "Protection active" : "Protection paused");
}

async function resetStats() {
  const result = await sendMessage<ShieldState>({ type: "resetStats" });
  state = {
    enabled: Boolean(result.enabled),
    blockedToday: Number(result.blockedToday ?? 0),
  };
  renderState();
  setStatus("Stats reset");
}

async function takeScreenshot() {
  await sendMessage<{ ok: true; filename?: string }>({
    type: "captureVisibleScreenshot",
  });
  setStatus("Screenshot saved");
}

async function takeCropScreenshot() {
  await sendMessage<{ ok: true }>({
    type: "startCropScreenshot",
  });
  setStatus("Drag to crop — Esc cancels");
  window.close();
}

async function takeFullPageScreenshot() {
  await sendMessage<{ ok: true; filename?: string }>({
    type: "captureFullPageScreenshot",
  });
  setStatus("Full page saved");
}

// ── Storage Inspection (toggled) ──

function getStorageCount(snapshot: StorageSnapshot, storageType: StorageType) {
  if (storageType === "cookies") return snapshot.cookies.length;
  if (storageType === "localStorage") return objectCount(snapshot.localStorage);
  if (storageType === "sessionStorage") return objectCount(snapshot.sessionStorage);
  if (storageType === "indexedDB") return snapshot.indexedDB.length;
  return snapshot.cacheStorage.length;
}

function getStorageItems(snapshot: StorageSnapshot, storageType: StorageType) {
  if (storageType === "cookies")
    return snapshot.cookies.map(
      (cookie) => `${cookie.name} @ ${cookie.domain}`,
    );
  if (storageType === "localStorage")
    return Object.entries(snapshot.localStorage).map(
      ([key, value]) => `${key}: ${trimValue(value)}`,
    );
  if (storageType === "sessionStorage")
    return Object.entries(snapshot.sessionStorage).map(
      ([key, value]) => `${key}: ${trimValue(value)}`,
    );
  if (storageType === "indexedDB") return snapshot.indexedDB;
  return snapshot.cacheStorage;
}

function createStorageDetails(
  snapshot: StorageSnapshot,
  storageType: StorageType,
  label: string,
) {
  const details = document.createElement("div");
  const title = document.createElement("h3");
  const list = document.createElement("ul");
  const items = getStorageItems(snapshot, storageType);

  details.className = "storage-inline-details";
  title.textContent = label;

  if (items.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Empty";
    list.append(item);
  } else {
    for (const value of items) {
      const item = document.createElement("li");
      item.textContent = value;
      list.append(item);
    }
  }

  details.append(title, list);
  return details;
}

function toggleStorageDetails(storageType: StorageType) {
  expandedStorageType =
    expandedStorageType === storageType ? null : storageType;
  if (latestSnapshot) renderStorage(latestSnapshot);
}

function renderStorageRow(
  snapshot: StorageSnapshot,
  storageType: StorageType,
  label: string,
) {
  const row = document.createElement("div");
  const header = document.createElement("div");
  const countButton = document.createElement("button");
  const clearButton = document.createElement("button");
  const isExpanded = expandedStorageType === storageType;

  row.className = isExpanded ? "storage-row is-expanded" : "storage-row";
  header.className = "storage-row-header";
  countButton.className = "storage-count-button";
  clearButton.className = "storage-clear-button";
  countButton.type = "button";
  clearButton.type = "button";
  countButton.textContent = `${label} ${getStorageCount(snapshot, storageType)}`;
  clearButton.textContent = "Clear";
  countButton.addEventListener("click", () =>
    toggleStorageDetails(storageType),
  );
  clearButton.addEventListener("click", () =>
    runTool(() => clearStorageType(storageType)),
  );

  header.append(countButton, clearButton);
  row.append(header);

  if (isExpanded) {
    row.append(createStorageDetails(snapshot, storageType, label));
  }

  return row;
}

function renderStorage(snapshot: StorageSnapshot) {
  latestSnapshot = snapshot;
  elements.storageDetails.hidden = true;
  elements.storageDetails.replaceChildren();
  elements.storageSummary.replaceChildren(
    renderStorageRow(snapshot, "cookies", "Cookies"),
    renderStorageRow(snapshot, "localStorage", "Local"),
    renderStorageRow(snapshot, "sessionStorage", "Session"),
    renderStorageRow(snapshot, "indexedDB", "IDB"),
    renderStorageRow(snapshot, "cacheStorage", "Cache"),
  );
}

async function toggleStoragePanel() {
  storagePanelOpen = !storagePanelOpen;
  if (storagePanelOpen) {
    const snapshot = await sendMessage<StorageSnapshot>({
      type: "inspectActiveTabStorage",
    });
    if (snapshot.ok === false)
      throw new Error(snapshot.error ?? "Could not inspect storage");
    elements.storagePanel.hidden = false;
    renderStorage(snapshot);
    setStatus("Storage inspected");
  } else {
    elements.storagePanel.hidden = true;
    latestSnapshot = null;
    expandedStorageType = null;
    elements.storageSummary.replaceChildren();
    elements.storageDetails.replaceChildren();
    setStatus("Storage panel closed");
  }
}

async function clearStorageType(storageType: StorageType) {
  const result = await sendMessage<{
    ok: boolean;
    clearedCookies?: number;
    error?: string;
  }>({ type: "clearStorageType", storageType });
  if (!result.ok) throw new Error(result.error ?? "Could not clear storage");
  setStatus("Storage cleared");
  // Re-inspect to refresh the panel
  if (storagePanelOpen) {
    const snapshot = await sendMessage<StorageSnapshot>({
      type: "inspectActiveTabStorage",
    });
    if (snapshot.ok !== false) renderStorage(snapshot);
  }
}

async function clearAllStorage() {
  const result = await sendMessage<{
    ok: boolean;
    clearedCookies?: number;
    error?: string;
  }>({ type: "clearActiveTabStorage" });
  if (!result.ok) throw new Error(result.error ?? "Could not clear storage");
  setStatus(`Cleared storage and ${result.clearedCookies ?? 0} cookies`);
  // Re-inspect to refresh the panel
  if (storagePanelOpen) {
    const snapshot = await sendMessage<StorageSnapshot>({
      type: "inspectActiveTabStorage",
    });
    if (snapshot.ok !== false) renderStorage(snapshot);
  }
}

// ── Video Downloader (always active) ──

async function refreshVideos() {
  const result = await sendMessage<{ videos: any[]; activeVideo?: ActiveVideoEntry; activeSizeFormatted?: string }>({
    type: "getDetectedVideos",
  });

  activeVideo = result.activeVideo || null;
  allDetectedVideos = result.videos || [];
  renderActiveVideo(result.activeSizeFormatted);
  renderMoreVideos();
}

function formatExtension(url: string, contentType?: string): string {
  if (contentType) {
    const lower = contentType.toLowerCase();
    if (lower.includes("mp4")) return "MP4";
    if (lower.includes("webm")) return "WEBM";
    if (lower.includes("ogg")) return "OGV";
    if (lower.includes("mpegurl") || lower.includes("m3u8")) return "HLS";
    if (lower.includes("dash+xml") || lower.includes("mpd")) return "DASH";
    if (lower.includes("x-matroska") || lower.includes("mkv")) return "MKV";
    if (lower.includes("x-flv") || lower.includes("flv")) return "FLV";
    if (lower.includes("avi")) return "AVI";
    if (lower.includes("mov") || lower.includes("quicktime")) return "MOV";
  }
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split(".");
    const ext = parts[parts.length - 1]?.split(/[?#]/)[0]?.toLowerCase();
    if (ext && ext.length >= 2 && ext.length <= 4) return ext.toUpperCase();
  } catch {}
  return "MP4";
}

function renderActiveVideo(activeSizeFormatted?: string) {
  if (activeVideo && activeVideo.url) {
    elements.videoNowPlaying.hidden = false;
    elements.videoEmpty.hidden = true;
    elements.videoActiveName.textContent = activeVideo.filename || "Video";
    elements.videoActiveName.title = activeVideo.url;
    elements.videoActiveFormat.textContent = formatExtension(
      activeVideo.url,
      activeVideo.contentType,
    );
    elements.videoActiveSize.textContent = activeSizeFormatted || "Streaming";

    elements.videoStartDownload.onclick = () =>
      runTool(() => downloadVideo(activeVideo!.url, activeVideo!.filename));
  } else {
    elements.videoNowPlaying.hidden = true;
    elements.videoEmpty.hidden = false;
  }
}

function renderMoreVideos() {
  const otherVideos = allDetectedVideos.filter(
    (v) => v.url !== activeVideo?.url,
  );
  if (otherVideos.length === 0) {
    elements.videoMoreList.hidden = true;
    elements.videoMoreToggle.hidden = true;
    return;
  }

  elements.videoMoreToggle.hidden = false;
  elements.videoMoreToggle.textContent = showingMoreVideos
    ? `Hide ${otherVideos.length} more`
    : `Show all (${otherVideos.length + 1} detected)`;

  elements.videoMoreList.replaceChildren();
  if (!showingMoreVideos) {
    elements.videoMoreList.hidden = true;
    return;
  }

  elements.videoMoreList.hidden = false;
  for (const video of allDetectedVideos) {
    const item = document.createElement("div");
    item.className = "video-more-item";

    const name = document.createElement("span");
    name.className = "vs-more-name";
    name.textContent = video.filename || "Video";
    name.title = video.url;

    const meta = document.createElement("span");
    meta.className = "vs-more-meta";
    meta.textContent = formatExtension(video.url, video.contentType);

    const dlBtn = document.createElement("button");
    dlBtn.className = "vs-more-dl";
    dlBtn.textContent = "Download";
    dlBtn.onclick = (e) => {
      e.stopPropagation();
      runTool(() => downloadVideo(video.url, video.filename));
    };

    item.append(name, meta, dlBtn);
    item.addEventListener("click", () => {
      runTool(() => downloadVideo(video.url, video.filename));
    });
    elements.videoMoreList.appendChild(item);
  }
}

elements.videoMoreToggle.addEventListener("click", () => {
  showingMoreVideos = !showingMoreVideos;
  renderMoreVideos();
});

async function downloadVideo(url: string, filename?: string) {
  await sendMessage({ type: "downloadVideo", url, filename });
  setStatus("Download started");
}

// ── Screenshot dropdown ──

let screenshotDropdownOpen = false;

function toggleScreenshotDropdown(e: MouseEvent) {
  e.stopPropagation();
  screenshotDropdownOpen = !screenshotDropdownOpen;
  elements.screenshotDropdown.hidden = !screenshotDropdownOpen;
}

// Close dropdown when clicking outside
function closeScreenshotDropdown() {
  screenshotDropdownOpen = false;
  elements.screenshotDropdown.hidden = true;
}

document.addEventListener("click", (e) => {
  if (screenshotDropdownOpen && !elements.screenshotBtn.contains(e.target as Node)) {
    closeScreenshotDropdown();
  }
});

  async function runTool(action: () => Promise<void>) {
  const buttons = [
    elements.cropShot,
    elements.cropScreenshot,
    elements.fullPageShot,
    elements.inspectStorage,
    elements.clearStorage,
    elements.videoStartDownload,
    elements.videoRefreshBtn,
  ];

  for (const button of buttons) {
    button.disabled = true;
  }

  try {
    await action();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Action failed");
  } finally {
    for (const button of buttons) {
      button.disabled = false;
    }
  }
}

// ── Event listeners ──

elements.toggleProtection.addEventListener("click", () =>
  runTool(toggleProtection),
);
elements.resetStats.addEventListener("click", () => runTool(resetStats));
elements.screenshotBtn.addEventListener("click", (e) => toggleScreenshotDropdown(e));
elements.cropShot.addEventListener("click", () => { closeScreenshotDropdown(); runTool(takeScreenshot); });
elements.cropScreenshot.addEventListener("click", () => { closeScreenshotDropdown(); runTool(takeCropScreenshot); });
elements.fullPageShot.addEventListener("click", () => { closeScreenshotDropdown(); runTool(takeFullPageScreenshot); });
elements.inspectStorage.addEventListener("click", () =>
  runTool(toggleStoragePanel),
);
elements.clearStorage.addEventListener("click", () => runTool(clearAllStorage));
elements.videoRefreshBtn.addEventListener("click", () =>
  runTool(refreshVideos),
);

// ── Storage changes from background ──

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  state = {
    enabled: changes.enabled
      ? Boolean(changes.enabled.newValue)
      : state.enabled,
    blockedToday: changes.blockedToday
      ? Number(changes.blockedToday.newValue ?? 0)
      : state.blockedToday,
  };
  renderState();
});

// ── Init ──

void readState();

// Auto-start video detection (always visible)
void refreshVideos();
videoRefreshInterval = window.setInterval(async () => {
  await refreshVideos();
}, 2000);
