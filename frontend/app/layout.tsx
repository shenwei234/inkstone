import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { SiteFooter } from "@/components/site-footer";
import { SiteWallpaper } from "@/components/site-wallpaper";

export const metadata: Metadata = {
  title: {
    default: "InkStone",
    template: "%s | InkStone",
  },
  description: "InkStone — 现代化多用户博客系统",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>
          <SiteWallpaper />
          <Navbar />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
