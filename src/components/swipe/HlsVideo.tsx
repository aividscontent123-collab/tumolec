"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

/** Odtwarzacz trailera Steam. Steam appdetails zwraca dziś trailery WYŁĄCZNIE
 * jako manifesty HLS (.m3u8), nie bezpośrednie pliki mp4/webm (zweryfikowane
 * na żywym API 2026-07-14) -- HLS gra natywnie tylko w Safari/iOS, więc
 * gdzie indziej (Chrome/Firefox/Android) używamy hls.js jako fallback. */
export function HlsVideo({ hlsUrl, poster }: { hlsUrl: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
  }, [hlsUrl]);

  return (
    <video
      ref={videoRef}
      controls
      poster={poster}
      className="aspect-video w-full rounded-xl bg-black"
    />
  );
}
