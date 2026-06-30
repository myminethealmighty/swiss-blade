"use client";

import { useEffect, useMemo, useState } from "react";

type ShieldState = {
  enabled: boolean;
  blockedToday: number;
  allowlist: string[];
};

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

function isChromeExtensionPage() {
  return window.location.protocol === "chrome-extension:" && typeof chrome !== "undefined";
}

async function readStoredState(): Promise<ShieldState> {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_STATE, (stored) => {
      resolve({
        enabled: Boolean(stored.enabled),
        blockedToday: Number(stored.blockedToday ?? 0),
        allowlist: Array.isArray(stored.allowlist) ? stored.allowlist : []
      });
    });
  });
}

async function writeStoredState(nextState: ShieldState) {
  await chrome.storage.local.set(nextState);
}

async function sendMessage<T>(message: unknown): Promise<T> {
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

async function sendTabMessageOnce<T>(tabId: number, message: unknown): Promise<T> {
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

async function sendTabMessage<T>(message: unknown): Promise<T> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");

  try {
    return await sendTabMessageOnce<T>(tab.id, message);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    return sendTabMessageOnce<T>(tab.id, message);
  }
}

async function setRulesEnabled(enabled: boolean) {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enabled ? ["ads"] : [],
    disableRulesetIds: enabled ? [] : ["ads"]
  });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? "#CE123C" : "#6b7280" });
  await chrome.action.setBadgeText({ text: enabled ? "" : "off" });
}

function objectCount(value: Record<string, string>) {
  return Object.keys(value).length;
}

function trimValue(value: string) {
  return value.length > 80 ? `${value.slice(0, 80)}...` : value;
}

export default function PopupPage() {
  const [state, setState] = useState<ShieldState>(DEFAULT_STATE);
  const [isExtension, setIsExtension] = useState(false);
  const [status, setStatus] = useState("Preview mode");
  const [storageSnapshot, setStorageSnapshot] = useState<StorageSnapshot | null>(null);
  const [isToolBusy, setIsToolBusy] = useState(false);

  useEffect(() => {
    if (!isChromeExtensionPage()) {
      return;
    }

    let isMounted = true;

    void readStoredState().then((storedState) => {
      if (!isMounted) return;
      setIsExtension(true);
      setState(storedState);
      setStatus(storedState.enabled ? "Protection active" : "Protection paused");
    });

    const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local") return;

      setState((currentState) => {
        const nextState = {
          ...currentState,
          enabled: changes.enabled ? Boolean(changes.enabled.newValue) : currentState.enabled,
          blockedToday: changes.blockedToday ? Number(changes.blockedToday.newValue ?? 0) : currentState.blockedToday,
          allowlist: changes.allowlist && Array.isArray(changes.allowlist.newValue) ? changes.allowlist.newValue : currentState.allowlist
        };
        setStatus(nextState.enabled ? "Protection active" : "Protection paused");
        return nextState;
      });
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      isMounted = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const protectionLabel = useMemo(() => {
    if (!isExtension) return "Preview";
    return state.enabled ? "Blocking ads" : "Paused";
  }, [isExtension, state.enabled]);

  async function toggleProtection() {
    if (!isExtension) return;
    const fallbackState = { ...state, enabled: !state.enabled };

    try {
      const nextState = await sendMessage<ShieldState>({
        type: "setEnabled",
        enabled: fallbackState.enabled
      });
      setState(nextState);
      setStatus(nextState.enabled ? "Protection active" : "Protection paused");
    } catch {
      await writeStoredState(fallbackState);
      await setRulesEnabled(fallbackState.enabled);
      setState(fallbackState);
      setStatus(fallbackState.enabled ? "Protection active" : "Protection paused");
    }
  }

  async function resetStats() {
    if (!isExtension) return;
    const fallbackState = { ...state, blockedToday: 0 };

    try {
      const nextState = await sendMessage<ShieldState>({ type: "resetStats" });
      setState(nextState);
    } catch {
      await writeStoredState(fallbackState);
      await chrome.action.setBadgeText({ text: fallbackState.enabled ? "" : "off" });
      setState(fallbackState);
    }

    setStatus("Stats reset");
  }

  async function startCropScreenshot() {
    if (!isExtension) return;
    setIsToolBusy(true);

    try {
      await sendTabMessage<{ ok: true }>({ type: "startAreaScreenshot" });
      setStatus("Drag on the page to capture");
      window.close();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start capture");
    } finally {
      setIsToolBusy(false);
    }
  }

  async function inspectStorage() {
    if (!isExtension) return;
    setIsToolBusy(true);

    try {
      const snapshot = await sendMessage<StorageSnapshot>({ type: "inspectActiveTabStorage" });
      if (snapshot.ok === false) throw new Error(snapshot.error ?? "Could not inspect storage");
      setStorageSnapshot(snapshot);
      setStatus("Storage inspected");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not inspect storage");
    } finally {
      setIsToolBusy(false);
    }
  }

  async function clearStorage() {
    if (!isExtension) return;
    setIsToolBusy(true);

    try {
      const result = await sendMessage<{ ok: boolean; clearedCookies?: number; error?: string }>({ type: "clearActiveTabStorage" });
      if (!result.ok) throw new Error(result.error ?? "Could not clear storage");
      setStorageSnapshot(null);
      setStatus(`Cleared storage and ${result.clearedCookies ?? 0} cookies`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not clear storage");
    } finally {
      setIsToolBusy(false);
    }
  }

  function openOptions() {
    if (!isExtension) return;
    chrome.runtime.openOptionsPage();
  }

  return (
    <main className="popup-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Swiss Blade</p>
          <h1>{protectionLabel}</h1>
        </div>
        <button
          aria-label={state.enabled ? "Pause ad blocking" : "Resume ad blocking"}
          className={`power-button ${state.enabled ? "is-on" : ""}`}
          disabled={!isExtension}
          onClick={toggleProtection}
          type="button"
        >
          <span />
        </button>
      </section>

      <section className="stats-grid">
        <div className="metric">
          <span>Blocked today</span>
          <strong>{state.blockedToday}</strong>
        </div>
        <div className="metric">
          <span>Allowlisted</span>
          <strong>{state.allowlist.length}</strong>
        </div>
      </section>

      <section className="tool-section">
        <p className="section-title">Tools</p>
        <div className="actions three-actions">
          <button className="secondary-button" disabled={!isExtension || isToolBusy} onClick={startCropScreenshot} type="button">
            Crop Shot
          </button>
          <button className="secondary-button" disabled={!isExtension || isToolBusy} onClick={inspectStorage} type="button">
            Inspect
          </button>
          <button className="secondary-button danger-button" disabled={!isExtension || isToolBusy} onClick={clearStorage} type="button">
            Clear All
          </button>
        </div>
      </section>

      {storageSnapshot ? (
        <section className="storage-panel">
          <div className="storage-summary">
            <span>Cookies {storageSnapshot.cookies.length}</span>
            <span>Local {objectCount(storageSnapshot.localStorage)}</span>
            <span>Session {objectCount(storageSnapshot.sessionStorage)}</span>
            <span>IDB {storageSnapshot.indexedDB.length}</span>
            <span>Cache {storageSnapshot.cacheStorage.length}</span>
          </div>

          <details open>
            <summary>Cookies</summary>
            <ul>
              {storageSnapshot.cookies.length === 0 ? <li>Empty</li> : storageSnapshot.cookies.map((cookie) => <li key={`${cookie.domain}-${cookie.name}`}>{cookie.name} @ {cookie.domain}</li>)}
            </ul>
          </details>

          <details>
            <summary>LocalStorage</summary>
            <ul>
              {objectCount(storageSnapshot.localStorage) === 0 ? <li>Empty</li> : Object.entries(storageSnapshot.localStorage).map(([key, value]) => <li key={key}>{key}: {trimValue(value)}</li>)}
            </ul>
          </details>

          <details>
            <summary>SessionStorage</summary>
            <ul>
              {objectCount(storageSnapshot.sessionStorage) === 0 ? <li>Empty</li> : Object.entries(storageSnapshot.sessionStorage).map(([key, value]) => <li key={key}>{key}: {trimValue(value)}</li>)}
            </ul>
          </details>

          <details>
            <summary>IndexedDB</summary>
            <ul>
              {storageSnapshot.indexedDB.length === 0 ? <li>Empty</li> : storageSnapshot.indexedDB.map((name) => <li key={name}>{name}</li>)}
            </ul>
          </details>

          <details>
            <summary>Cache Storage</summary>
            <ul>
              {storageSnapshot.cacheStorage.length === 0 ? <li>Empty</li> : storageSnapshot.cacheStorage.map((name) => <li key={name}>{name}</li>)}
            </ul>
          </details>
        </section>
      ) : null}

      <section className="status-row">
        <span className={state.enabled ? "status-dot on" : "status-dot"} />
        <p>{status}</p>
      </section>

      <div className="actions">
        <button className="secondary-button" disabled={!isExtension} onClick={openOptions} type="button">
          Options
        </button>
        <button className="secondary-button" disabled={!isExtension} onClick={resetStats} type="button">
          Reset
        </button>
      </div>
    </main>
  );
}
