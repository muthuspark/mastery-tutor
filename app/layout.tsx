import type { Metadata } from "next";
import { Libre_Baskerville } from "next/font/google";
import localFont from "next/font/local";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const titleFont = Libre_Baskerville({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-libre-baskerville",
  display: "swap",
});

const paragraphFont = localFont({
  src: [
    { path: "./fonts/source-sans-pro-400-normal.ttf", weight: "400", style: "normal" },
    { path: "./fonts/source-sans-pro-600-normal.ttf", weight: "600", style: "normal" },
    { path: "./fonts/source-sans-pro-700-normal.ttf", weight: "700", style: "normal" },
    { path: "./fonts/source-sans-pro-400-italic.ttf", weight: "400", style: "italic" },
    { path: "./fonts/source-sans-pro-600-italic.ttf", weight: "600", style: "italic" },
    { path: "./fonts/source-sans-pro-700-italic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-source-sans-pro",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mastery Tutor",
  description: "Learn a topic one mastered chapter at a time.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${titleFont.variable} ${paragraphFont.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <Providers><SiteHeader />{children}<SiteFooter /></Providers>
      </body>
    </html>
  );
}
