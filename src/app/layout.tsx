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
  title: "Skeleton Vision - จับการเคลื่อนไหวร่างกายและมือ",
  description: "เว็บแอปจับการเคลื่อนไหวของร่างกายและมือผ่านกล้องเว็บแคม แสดงผลเป็นโครงกระดูกเรียลไทม์ด้วย MediaPipe",
  keywords: ["skeleton", "pose tracking", "hand tracking", "MediaPipe", "webcam", "body tracking"],
  authors: [{ name: "Z.ai Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Skeleton Vision",
    description: "Real-time body and hand skeleton tracking via webcam",
    siteName: "Skeleton Vision",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Skeleton Vision",
    description: "Real-time body and hand skeleton tracking via webcam",
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
