import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";
import { MaintenanceGate } from "@/components/maintenance-gate";
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
        {/* 极验域名预热：提前完成 DNS/TLS 握手，缩短 gt4.js 与验证接口的建连等待 */}
        <link rel="preconnect" href="https://static.geetest.com" />
        <link rel="preconnect" href="https://gcaptcha4.geetest.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://static.geetest.com" />
        {/* 极验第四代行为验证：要求与业务页面同步初始化，用 beforeInteractive 加载 */}
        <Script
          src="https://static.geetest.com/v4/gt4.js"
          strategy="beforeInteractive"
        />
        <Providers>
          <MaintenanceGate>
            <SiteWallpaper />
            <Navbar />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </MaintenanceGate>
        </Providers>
      </body>
    </html>
  );
}
