"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Kod QR + udostępnianie linku do pokoju -- wyciągnięte z RoomLobby, żeby
 * RoomUpgradeButton mógł pokazać dokładnie to samo bez duplikowania logiki
 * QRCode/navigator.share. Kod QR celowo koduje publiczny URL produkcyjny
 * (nie window.location.origin) -- skanuje go inny telefon, który nie
 * dosięgnie localhosta ani preview-URL. */
export function useRoomShare(roomCode: string, title?: string) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!roomCode) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(`https://tumolec.vercel.app/room/${roomCode}`, { margin: 1, width: 200 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [roomCode]);

  async function handleShare() {
    const url = `https://tumolec.vercel.app/room/${roomCode}`;
    if (navigator.share) {
      // Odrzucenie (użytkownik anuluje arkusz share) jest nieszkodliwe -- ignorujemy.
      try {
        await navigator.share({ title: title ?? "Tumolec", url });
      } catch {
        /* anulowane przez użytkownika */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard niedostępny/odrzucony -- nic więcej nie da się zrobić */
    }
  }

  return { qrDataUrl, copied, handleShare };
}
