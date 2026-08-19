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
    default: "The Rule of Two",
    template: "%s | The Rule of Two",
  },
  description:
    "Better decisions need more than one perspective.",
  applicationName:
    "The Rule of Two",
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