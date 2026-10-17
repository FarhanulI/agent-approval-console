import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { env } from "@/lib/config/env";
import { Providers } from "./providers";
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
  metadataBase: new URL(env.APP_URL),
  title: {
    default: "Agent Approval Console",
    template: "%s · Agent Approval Console",
  },
  description:
    "A human-supervision console for reviewing and monitoring AI agent actions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} min-h-full`}>
      <body className="min-h-full bg-canvas font-sans text-fg antialiased">
        <a
          className="sr-only fixed left-4 top-4 z-50 rounded-md bg-surface px-4 py-3 font-medium text-fg shadow-lg focus:not-sr-only"
          href="#main"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
