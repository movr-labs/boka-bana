import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bokabana - Tennis & padel i Sverige",
  description: "Sok och boka lediga banor med realtider fran Matchi.",
  icons: {
    icon: "/loga_utan_text/boka_bana_transparent.png?v=20260602",
    shortcut: "/loga_utan_text/boka_bana_transparent.png?v=20260602",
    apple: "/loga_utan_text/boka_bana_transparent.png?v=20260602",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
