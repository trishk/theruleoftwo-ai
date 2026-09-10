import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
} from "next/font/google";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TheRuleOfTwo.ai",
    template: "%s | TheRuleOfTwo.ai",
  },
  description:
    "Better decisions need more than one perspective.",
  applicationName:
    "TheRuleOfTwo.ai",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="dark"
      suppressHydrationWarning
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-full flex-col font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
