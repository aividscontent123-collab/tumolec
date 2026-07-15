"use client";

/** Polubione w trybie solo -- lista appid w localStorage, spójne z resztą
 * trybu solo (decyzje zostają w przeglądarce, zero Firestore). Logika
 * (dodaj/usuń bez duplikatów) jest czystymi funkcjami operującymi na tablicy
 * -- testowalne bez DOM; localStorage get/set to cienkie, nietestowane
 * wrappery (konwencja tego repo, zob. useParticipant.ts). */

const KEY = "tumolec:solo:liked";

export function addLiked(current: number[], steamAppId: number): number[] {
  return current.includes(steamAppId) ? current : [...current, steamAppId];
}

export function removeLiked(current: number[], steamAppId: number): number[] {
  return current.filter((id) => id !== steamAppId);
}

export function getLocalLiked(): number[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalLiked(ids: number[]): void {
  localStorage.setItem(KEY, JSON.stringify(ids));
}
