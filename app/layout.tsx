import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const editorial = localFont({
  src: [
    { path: "./fonts/source-serif-regular.ttf", weight: "400" },
    { path: "./fonts/source-serif-semibold.ttf", weight: "600" },
  ],
  variable: "--font-editorial", display: "swap",
});

export const metadata: Metadata = {
  title: "Mastery Tutor",
  description: "Learn a topic one mastered chapter at a time.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={editorial.variable}>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <Providers><SiteHeader />{children}<SiteFooter /></Providers>
      </body>
    </html>
  );
}
