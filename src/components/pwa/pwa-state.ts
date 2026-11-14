"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared PWA state: the browser's install prompt (Android/desktop Chrome),
 * whether the app is running installed (standalone), and a waiting update.
 */

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type State = {
  installEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  standalone: boolean;
  ios: boolean;
  updateReady: ServiceWorker | null;
};

let state: State = { installEvent: null, installed: false, standalone: false, ios: false, updateReady: null };
const listeners = new Set<() => void>();
const SERVER: State = state;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

let started = false;
/** Called once from the root (PwaManager). */
export function startPwaState() {
  if (started || typeof window === "undefined") return;
  started = true;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  set({ standalone, ios });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of the browser's mini-bar
    set({ installEvent: e as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => set({ installed: true, installEvent: null }));
  window.matchMedia("(display-mode: standalone)").addEventListener("change", (e) => set({ standalone: e.matches }));
}

export function setUpdateReady(worker: ServiceWorker | null) {
  set({ updateReady: worker });
}

export function usePwa(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => SERVER,
  );
}

/** Shows the browser's install dialog. Returns true if the user installed. */
export async function promptInstall(): Promise<boolean> {
  const e = state.installEvent;
  if (!e) return false;
  await e.prompt();
  const choice = await e.userChoice;
  set({ installEvent: null, installed: choice.outcome === "accepted" || state.installed });
  return choice.outcome === "accepted";
}
