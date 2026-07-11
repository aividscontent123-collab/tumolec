"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "tumolec:theme";
const CHANGE_EVENT = "tumolec:theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** Prosty przełącznik jasny/ciemny. Domyślnie ciemny (brief wizualny) --
 * jasny motyw to jawny wybór, zapamiętany w localStorage. Klasa `.dark`
 * na <html> steruje wszystkimi tokenami w globals.css; inicjalne odczytanie
 * localStorage przed hydracją robi <Script beforeInteractive> w layout.tsx.
 * `useSyncExternalStore` zamiast useState+useEffect z tego samego powodu co
 * w useParticipant.ts -- czytanie stanu z DOM nie może być "setState w efekcie". */
export function ThemeToggle() {
  const isDark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => true,
  );

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Włącz jasny motyw" : "Włącz ciemny motyw"}
      className="bg-card border-border text-foreground fixed top-3 right-3 z-50 flex h-9 w-9 items-center justify-center rounded-full border text-base"
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
