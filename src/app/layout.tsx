import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Browser Agent Harness",
  description: "Domain-neutral workspace for browser-native agent runs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
