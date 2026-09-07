import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: {
    default: "Blog 平台",
    template: "%s | Blog 平台",
  },
  description: "多用户博客平台",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <footer className="border-t py-6">
            <p className="mx-auto max-w-5xl px-4 text-sm text-muted-foreground">
              Blog 平台 · Powered by Next.js + Gin
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
