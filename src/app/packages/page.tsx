"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { subscribeToPackages, type GamePackage } from "@/lib/rooms";

export default function PackagesPage() {
  const [packages, setPackages] = useState<GamePackage[]>([]);

  useEffect(() => subscribeToPackages(setPackages), []);

  return (
    <main className="flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[30px]">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </Link>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Paczki gier</h1>
      </div>

      <p className="text-text-secondary text-xs">
        Zapisane paczki są wspólne dla wszystkich pokoi. Dodasz je do pokoju z ekranu puli.
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {packages.length === 0 ? (
          <p className="text-text-secondary py-8 text-center text-sm">
            Brak zapisanych paczek. Zapisz pierwszą z ekranu puli w pokoju.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {packages.map((pkg) => (
              <li
                key={pkg.id}
                className="bg-card border-border flex items-center justify-between rounded-xl border p-4 text-sm text-foreground"
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{pkg.name}</span>
                <span className="text-text-secondary shrink-0 text-xs">
                  {pkg.gameCount} {pkg.gameCount === 1 ? "gra" : "gier"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
