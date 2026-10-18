import type { Metadata } from "next";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mastery Tutor",
  description: "Learn a topic one mastered chapter at a time.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers><SiteHeader />{children}</Providers>
      </body>
    </html>
  );
}
