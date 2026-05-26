import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KOSPI LAB — 한국 주식 실시간 시세",
  description: "한국 주식 실시간 시세 대시보드. 내 관심 종목을 추가하고 실시간으로 확인하세요.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col bg-[#060610] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
