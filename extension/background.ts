export {};

type ExtensionMessage =
  | { type: "getState" }
  | { type: "setEnabled"; enabled: boolean }
  | { type: "resetStats" }
  | { type: "incrementBlocked"; count: number }
  | { type: "captureCrop"; rect: CropRect }
  | { type: "inspectActiveTabStorage" }
  | { type: "clearActiveTabStorage" }
  | { type: "startCropScreenshot" }
  | { type: "captureVisibleScreenshot" }
  | { type: "clearStorageType"; storageType: StorageType };

type StorageType = "cookies" | "localStorage" | "sessionStorage" | "indexedDB" | "cacheStorage";

type StoredState = {
  enabled: boolean;
  blockedToday: number;
  allowlist: string[];
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
  allowlist: []
};

const ALLOWLIST_RULE_START_ID = 10000;
const pendingCaptures = new Map<number, string>();

async function readState(): Promise<StoredState> {
  const stored = await chrome.storage.local.get(DEFAULT_STATE);
  return {
    enabled: Boolean(stored.enabled),
    blockedToday: Number(stored.blockedToday ?? 0),
    allowlist: Array.isArray(stored.allowlist) ? stored.allowlist : []
  };
}

function normalizeAllowlist(allowlist: string[]) {
  return allowlist.map((domain) => domain.trim().replace(/^www\./, "").toLowerCase()).filter(Boolean);
}

async function syncAllowlistRules(allowlist: string[]) {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const oldRuleIds = existingRules
    .filter((rule) => rule.id >= ALLOWLIST_RULE_START_ID)
    .map((rule) => rule.id);

  const addRules: chrome.declarativeNetRequest.Rule[] = normalizeAllowlist(allowlist).map((domain, index) => ({
    id: ALLOWLIST_RULE_START_ID + index,
    priority: 100,
    action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW_ALL_REQUESTS },
    condition: {
      requestDomains: [domain],
      resourceTypes: [
        chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
        chrome.declarativeNetRequest.ResourceType.SUB_FRAME
      ]
    }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRuleIds,
    addRules
  });
}

async function setRulesEnabled(enabled: boolean) {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enabled ? ["ads"] : [],
    disableRulesetIds: enabled ? [] : ["ads"]
  });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? "#CE123C" : "#6b7280" });
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
  return chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (!tab?.id || !tab.url) throw new Error("No active tab found");
    return tab;
  });
}

async function injectContentScript(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
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
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }

    return `data:${blob.type};base64,${btoa(binary)}`;
  });
}

async function startCropScreenshot() {
  const tab = await getActiveTab();
  if (!tab.windowId) throw new Error("No active window found");

  const captureUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  pendingCaptures.set(tab.id!, captureUrl);
  await sendTabMessage<{ ok: true }>(tab.id!, { type: "startAreaScreenshot" });
  return { ok: true };
}

async function captureVisibleScreenshot() {
  const tab = await getActiveTab();
  if (!tab.windowId) throw new Error("No active window found");

  const captureUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const filename = "swiss-blade.png";

  await chrome.downloads.download({
    url: captureUrl,
    filename,
    conflictAction: "uniquify",
    saveAs: true
  });

  return { ok: true, filename };
}

async function cropVisibleTab(rect: CropRect, sender: chrome.runtime.MessageSender) {
  const tab = sender.tab;
  if (!tab?.id) throw new Error("Screenshot must be started from a tab");

  const captureUrl = pendingCaptures.get(tab.id);
  pendingCaptures.delete(tab.id);
  if (!captureUrl) throw new Error("No pending screenshot found. Click Crop Shot again.");

  const scale = Math.max(rect.devicePixelRatio || 1, 1);
  const captureBlob = await fetch(captureUrl).then((response) => response.blob());
  const image = await createImageBitmap(captureBlob);
  const sourceX = Math.max(0, Math.round(rect.x * scale));
  const sourceY = Math.max(0, Math.round(rect.y * scale));
  const sourceWidth = Math.max(1, Math.min(image.width - sourceX, Math.round(rect.width * scale)));
  const sourceHeight = Math.max(1, Math.min(image.height - sourceY, Math.round(rect.height * scale)));
  const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Could not create screenshot canvas");

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  const cropBlob = await canvas.convertToBlob({ type: "image/png" });
  const dataUrl = await blobToDataUrl(cropBlob);
  const filename = "swiss-blade.png";

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    conflictAction: "uniquify",
    saveAs: true
  });

  return { ok: true, filename };
}

async function inspectActiveTabStorage(): Promise<StorageSnapshot> {
  const tab = await getActiveTab();
  const pageStorage = await sendTabMessage<PageStorageSnapshot>(tab.id!, { type: "inspectPageStorage" });
  const cookies = await chrome.cookies.getAll({ url: tab.url! });

  return {
    url: tab.url!,
    cookies,
    ...pageStorage
  };
}

async function clearCookiesForTab(tab: chrome.tabs.Tab) {
  const cookies = await chrome.cookies.getAll({ url: tab.url! });

  await Promise.all(
    cookies.map((cookie) =>
      chrome.cookies.remove({
        url: getCookieRemovalUrl(cookie),
        name: cookie.name,
        storeId: cookie.storeId
      })
    )
  );

  return cookies.length;
}

async function clearStorageType(storageType: StorageType) {
  const tab = await getActiveTab();

  if (storageType === "cookies") {
    return { ok: true, clearedCookies: await clearCookiesForTab(tab) };
  }

  const pageResult = await sendTabMessage<{ ok: true }>(tab.id!, { type: "clearPageStorageType", storageType });
  return { ok: pageResult.ok, clearedCookies: 0 };
}

async function clearActiveTabStorage() {
  const tab = await getActiveTab();
  const clearedCookies = await clearCookiesForTab(tab);
  const pageResult = await sendTabMessage<{ ok: true }>(tab.id!, { type: "clearPageStorage" });
  return {
    ok: pageResult.ok,
    clearedCookies
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const state = await readState();
  await chrome.storage.local.set({ ...DEFAULT_STATE, ...state });
  await setRulesEnabled(state.enabled);
  await syncAllowlistRules(state.allowlist);
});

chrome.runtime.onStartup.addListener(async () => {
  const state = await readState();
  await setRulesEnabled(state.enabled);
  await syncAllowlistRules(state.allowlist);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.allowlist) return;
  void syncAllowlistRules(changes.allowlist.newValue ?? []);
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
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
      await chrome.action.setBadgeText({ text: String(Math.min(blockedToday, 999)) });
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

    if (message.type === "captureCrop") {
      sendResponse(await cropVisibleTab(message.rect, sender));
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
  })().catch((error) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown error" });
  });

  return true;
});
