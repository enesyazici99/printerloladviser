import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "LoL Advisor — Pro Buildler ve Draft Asistanı",
    template: "%s — LoL Advisor",
  },
  description:
    "Challenger ve Grandmaster oyuncularının buildleri, eşya geçmişi, rünleri ve canlı şampiyon seçimi için draft önerileri.",
  keywords: ["League of Legends", "LoL", "pro builds", "probuilds", "draft", "counter pick", "build"],
  openGraph: {
    title: "LoL Advisor — Pro Buildler ve Draft Asistanı",
    description: "Challenger buildleri, eşya geçmişi ve canlı draft önerileri.",
    type: "website",
    locale: "tr_TR",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-[1240px] px-3 pb-16 pt-4 sm:px-5">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
