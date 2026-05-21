import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bokabana - Tennis & padel i Sverige",
  description: "Sok och boka lediga banor med realtider fran Matchi.",
  icons: {
    icon: "/bb-logo.png",
    shortcut: "/bb-logo.png",
    apple: "/bb-logo.png",
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
