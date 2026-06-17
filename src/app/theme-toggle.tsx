"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "bah-theme";
const THEME_CHANGE_EVENT = "bah-theme-change";
type Theme = "system" | "light" | "dark";

function getDocumentTheme(): Theme {
  const current = document.documentElement.dataset.theme;
  return current === "light" || current === "dark" ? current : "system";
}

function subscribeToThemeChange(onStoreChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
}

function getServerTheme(): Theme {
  return "system";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeToThemeChange,
    getDocumentTheme,
    getServerTheme,
  );

  function onChange(value: Theme) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // localStorage unavailable — non-fatal.
    }
    if (value === "light" || value === "dark") {
      document.documentElement.dataset.theme = value;
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <label
      style={{
        position: "fixed",
        top: 12,
        right: 16,
        zIndex: 50,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: "var(--muted)",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "4px 8px",
      }}
    >
      <span style={{ fontWeight: 700 }}>Theme</span>
      <select
        className="input"
        style={{ width: "auto", padding: "4px 6px" }}
        value={theme}
        aria-label="Color theme"
        onChange={(event) => onChange(event.target.value as Theme)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
