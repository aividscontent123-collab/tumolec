import type { Metadata, Viewport } from "next";
import { Manrope, Space_Grotesk, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tumolec",
  description: "Wybierz grę na wieczór ze znajomymi — swipe, jak w Tinderze.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#8b5cf6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pl"
      className={`dark ${manrope.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-app-gradient text-foreground min-h-full flex flex-col">
        {/* Ustawia motyw z localStorage przed pierwszym malowaniem, żeby
            uniknąć błysku ciemnego motywu u kogoś, kto wybrał jasny. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{if(localStorage.getItem("tumolec:theme")==="light")document.documentElement.classList.remove("dark")}catch(e){}`}
        </Script>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
