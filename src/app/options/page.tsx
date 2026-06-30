"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type ShieldState = {
  enabled: boolean;
  blockedToday: number;
  allowlist: string[];
};

const DEFAULT_STATE: ShieldState = {
  enabled: true,
  blockedToday: 0,
  allowlist: []
};

function hasChromeStorage() {
  return window.location.protocol === "chrome-extension:" && typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

function normalizeDomain(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

export default function OptionsPage() {
  const [state, setState] = useState<ShieldState>(DEFAULT_STATE);
  const [domain, setDomain] = useState("");
  const [message, setMessage] = useState("Preview mode");
  const [isExtension, setIsExtension] = useState(false);

  useEffect(() => {
    if (!hasChromeStorage()) {
      return;
    }

    chrome.storage.local.get(DEFAULT_STATE, (stored) => {
      setIsExtension(true);
      setMessage("Settings are stored locally in Chrome.");
      setState({
        enabled: Boolean(stored.enabled),
        blockedToday: Number(stored.blockedToday ?? 0),
        allowlist: Array.isArray(stored.allowlist) ? stored.allowlist : []
      });
    });
  }, []);

  function persist(nextState: ShieldState) {
    setState(nextState);
    if (!isExtension) return;
    chrome.storage.local.set(nextState, () => setMessage("Settings saved"));
  }

  function addDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextDomain = normalizeDomain(domain);
    if (!nextDomain) return;

    if (state.allowlist.includes(nextDomain)) {
      setMessage("That domain is already allowlisted");
      return;
    }

    persist({ ...state, allowlist: [...state.allowlist, nextDomain].sort() });
    setDomain("");
  }

  function removeDomain(nextDomain: string) {
    persist({
      ...state,
      allowlist: state.allowlist.filter((item) => item !== nextDomain)
    });
  }

  return (
    <main className="options-shell">
      <header className="options-header">
        <div>
          <p className="eyebrow">Swiss Blade</p>
          <h1>Options</h1>
        </div>
        <Link className="secondary-button" href="/">
          Popup
        </Link>
      </header>

      <section className="settings-section">
        <div>
          <h2>Allowlisted domains</h2>
          <p>Blocking remains active everywhere except domains you trust.</p>
        </div>

        <form className="domain-form" onSubmit={addDomain}>
          <input
            aria-label="Domain"
            disabled={!isExtension}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com"
            type="text"
            value={domain}
          />
          <button disabled={!isExtension} type="submit">
            Add
          </button>
        </form>

        <ul className="domain-list">
          {state.allowlist.length === 0 ? (
            <li className="empty-state">No allowlisted domains yet.</li>
          ) : (
            state.allowlist.map((item) => (
              <li key={item}>
                <span>{item}</span>
                <button onClick={() => removeDomain(item)} type="button">
                  Remove
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <p className="settings-message">{message}</p>
    </main>
  );
}
