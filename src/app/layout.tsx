import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Skeleton Vision - จับมือและท่าทาง",
  description: "ติดตามข้อมือ ข้อนิ้ว และปลายนิ้วแบบเรียลไทม์ พร้อมเอฟเฟกต์ท่ามือ",
  keywords: ["hand tracking", "finger tracking", "hand gestures", "MediaPipe", "webcam"],
  authors: [{ name: "Z.ai Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Skeleton Vision",
    description: "Real-time hand and finger tracking with playful gesture effects",
    siteName: "Skeleton Vision",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Skeleton Vision",
    description: "Real-time hand and finger tracking with playful gesture effects",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
