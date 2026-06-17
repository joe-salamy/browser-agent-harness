import type { Metadata } from "next";
import { ThemeToggle } from "./theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Browser Agent Harness",
  description: "Domain-neutral workspace for browser-native agent runs.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('bah-theme');var d=document.documentElement;if(t==='light'||t==='dark'){d.dataset.theme=t;}else{d.removeAttribute('data-theme');}}catch(e){}})();",
          }}
        />
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
