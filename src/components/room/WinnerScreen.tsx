import Image from "next/image";
import type { SwipeGame } from "@/lib/types";

export function WinnerScreen({ game }: { game: SwipeGame | undefined }) {
  if (!game) {
    return <p className="text-text-secondary p-6 text-center text-sm">Ładowanie wyniku…</p>;
  }

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-6 px-[22px] text-center">
      <p className="text-text-secondary text-xs tracking-widest">GRAMY W</p>
      <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-2xl">
        {game.coverImageUrl && (
          <Image src={game.coverImageUrl} alt={game.title} fill className="object-cover" />
        )}
      </div>
      <h1 className="font-heading text-[30px] font-bold text-foreground">{game.title}</h1>
      <a
        href={`https://store.steampowered.com/app/${game.steamAppId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full px-8 py-3 text-sm font-bold text-white"
        style={{ backgroundColor: "var(--accent-brand)", boxShadow: "0 8px 24px var(--accent-brand-soft)" }}
      >
        Zobacz na Steam
      </a>
    </main>
  );
}
