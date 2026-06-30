export {};

type ShieldState = {
  enabled: boolean;
  blockedToday: number;
  allowlist: string[];
};

type StorageType = "cookies" | "localStorage" | "sessionStorage" | "indexedDB" | "cacheStorage";

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

const DEFAULT_STATE: ShieldState = {
  enabled: true,
  blockedToday: 0,
  allowlist: []
};

const elements = {
  protectionLabel: document.querySelector<HTMLHeadingElement>("#protectionLabel")!,
  toggleProtection: document.querySelector<HTMLButtonElement>("#toggleProtection")!,
  powerIcon: document.querySelector<HTMLElement>("#powerIcon")!,
  blockedToday: document.querySelector<HTMLElement>("#blockedToday")!,
  allowlisted: document.querySelector<HTMLElement>("#allowlisted")!,
  statusDot: document.querySelector<HTMLElement>("#statusDot")!,
  statusText: document.querySelector<HTMLElement>("#statusText")!,
  cropShot: document.querySelector<HTMLButtonElement>("#cropShot")!,
  inspectStorage: document.querySelector<HTMLButtonElement>("#inspectStorage")!,
  clearStorage: document.querySelector<HTMLButtonElement>("#clearStorage")!,
  openOptions: document.querySelector<HTMLButtonElement>("#openOptions")!,
  resetStats: document.querySelector<HTMLButtonElement>("#resetStats")!,
  storagePanel: document.querySelector<HTMLElement>("#storagePanel")!,
  storageSummary: document.querySelector<HTMLElement>("#storageSummary")!,
  storageDetails: document.querySelector<HTMLElement>("#storageDetails")!
};

let state: ShieldState = DEFAULT_STATE;
let latestSnapshot: StorageSnapshot | null = null;
let expandedStorageType: StorageType | null = null;

function setStatus(message: string) {
  elements.statusText.textContent = message;
}

function objectCount(value: Record<string, string>) {
  return Object.keys(value).length;
}

function trimValue(value: string) {
  return value.length > 80 ? `${value.slice(0, 80)}...` : value;
}

function renderState() {
  elements.protectionLabel.textContent = state.enabled ? "Blocking ads" : "Paused";
  elements.toggleProtection.classList.toggle("is-on", state.enabled);
  elements.toggleProtection.classList.toggle("is-off", !state.enabled);
  elements.powerIcon.textContent = state.enabled ? "ON" : "OFF";
  elements.statusDot.classList.toggle("on", state.enabled);
  elements.blockedToday.textContent = String(state.blockedToday);
  elements.allowlisted.textContent = String(state.allowlist.length);
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
  state = await chrome.storage.local.get(DEFAULT_STATE) as ShieldState;
  state = {
    enabled: Boolean(state.enabled),
    blockedToday: Number(state.blockedToday ?? 0),
    allowlist: Array.isArray(state.allowlist) ? state.allowlist : []
  };
  renderState();
  setStatus(state.enabled ? "Protection active" : "Protection paused");
}

async function toggleProtection() {
  const nextEnabled = !state.enabled;
  state = await sendMessage<ShieldState>({ type: "setEnabled", enabled: nextEnabled });
  renderState();
  setStatus(state.enabled ? "Protection active" : "Protection paused");
}

async function resetStats() {
  state = await sendMessage<ShieldState>({ type: "resetStats" });
  renderState();
  setStatus("Stats reset");
}

async function takeScreenshot() {
  await sendMessage<{ ok: true; filename?: string }>({ type: "captureVisibleScreenshot" });
  setStatus("Screenshot saved");
}

function getStorageCount(snapshot: StorageSnapshot, storageType: StorageType) {
  if (storageType === "cookies") return snapshot.cookies.length;
  if (storageType === "localStorage") return objectCount(snapshot.localStorage);
  if (storageType === "sessionStorage") return objectCount(snapshot.sessionStorage);
  if (storageType === "indexedDB") return snapshot.indexedDB.length;
  return snapshot.cacheStorage.length;
}

function getStorageItems(snapshot: StorageSnapshot, storageType: StorageType) {
  if (storageType === "cookies") return snapshot.cookies.map((cookie) => `${cookie.name} @ ${cookie.domain}`);
  if (storageType === "localStorage") return Object.entries(snapshot.localStorage).map(([key, value]) => `${key}: ${trimValue(value)}`);
  if (storageType === "sessionStorage") return Object.entries(snapshot.sessionStorage).map(([key, value]) => `${key}: ${trimValue(value)}`);
  if (storageType === "indexedDB") return snapshot.indexedDB;
  return snapshot.cacheStorage;
}

function createStorageDetails(snapshot: StorageSnapshot, storageType: StorageType, label: string) {
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
  expandedStorageType = expandedStorageType === storageType ? null : storageType;
  if (latestSnapshot) renderStorage(latestSnapshot);
}

function renderStorageRow(snapshot: StorageSnapshot, storageType: StorageType, label: string) {
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
  countButton.addEventListener("click", () => toggleStorageDetails(storageType));
  clearButton.addEventListener("click", () => runTool(() => clearStorageType(storageType)));

  header.append(countButton, clearButton);
  row.append(header);

  if (isExpanded) {
    row.append(createStorageDetails(snapshot, storageType, label));
  }

  return row;
}

function renderStorage(snapshot: StorageSnapshot) {
  latestSnapshot = snapshot;
  elements.storagePanel.hidden = false;
  elements.storageDetails.hidden = true;
  elements.storageDetails.replaceChildren();
  elements.storageSummary.replaceChildren(
    renderStorageRow(snapshot, "cookies", "Cookies"),
    renderStorageRow(snapshot, "localStorage", "Local"),
    renderStorageRow(snapshot, "sessionStorage", "Session"),
    renderStorageRow(snapshot, "indexedDB", "IDB"),
    renderStorageRow(snapshot, "cacheStorage", "Cache")
  );
}

async function inspectStorage() {
  const snapshot = await sendMessage<StorageSnapshot>({ type: "inspectActiveTabStorage" });
  if (snapshot.ok === false) throw new Error(snapshot.error ?? "Could not inspect storage");
  renderStorage(snapshot);
  setStatus("Storage inspected");
}

async function clearStorageType(storageType: StorageType) {
  const result = await sendMessage<{ ok: boolean; clearedCookies?: number; error?: string }>({ type: "clearStorageType", storageType });
  if (!result.ok) throw new Error(result.error ?? "Could not clear storage");
  await inspectStorage();
  setStatus("Storage cleared");
}

async function clearStorage() {
  const result = await sendMessage<{ ok: boolean; clearedCookies?: number; error?: string }>({ type: "clearActiveTabStorage" });
  if (!result.ok) throw new Error(result.error ?? "Could not clear storage");
  latestSnapshot = null;
  expandedStorageType = null;
  elements.storagePanel.hidden = true;
  elements.storageSummary.replaceChildren();
  elements.storageDetails.replaceChildren();
  setStatus(`Cleared storage and ${result.clearedCookies ?? 0} cookies`);
}

async function runTool(action: () => Promise<void>) {
  for (const button of [elements.cropShot, elements.inspectStorage, elements.clearStorage]) {
    button.disabled = true;
  }

  try {
    await action();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Action failed");
  } finally {
    for (const button of [elements.cropShot, elements.inspectStorage, elements.clearStorage]) {
      button.disabled = false;
    }
  }
}

elements.toggleProtection.addEventListener("click", () => runTool(toggleProtection));
elements.resetStats.addEventListener("click", () => runTool(resetStats));
elements.cropShot.addEventListener("click", () => runTool(takeScreenshot));
elements.inspectStorage.addEventListener("click", () => runTool(inspectStorage));
elements.clearStorage.addEventListener("click", () => runTool(clearStorage));
elements.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  state = {
    ...state,
    enabled: changes.enabled ? Boolean(changes.enabled.newValue) : state.enabled,
    blockedToday: changes.blockedToday ? Number(changes.blockedToday.newValue ?? 0) : state.blockedToday,
    allowlist: changes.allowlist && Array.isArray(changes.allowlist.newValue) ? changes.allowlist.newValue : state.allowlist
  };
  renderState();
});

void readState();
