import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Youth Soccer Rankings",
  description:
    "Rankings for competitive youth soccer teams in the Western US.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@100..900&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{__html: `
          @font-face {
            font-family: 'Archivo Variable';
            src: url('https://fonts.gstatic.com/s/archivo/v20/k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sLySOxauz1E.woff2') format('woff2');
            font-weight: 100 900;
            font-stretch: 62% 150%;
            font-display: swap;
          }
        `}} />

      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary text-primary-foreground text-sm font-bold">
                YSR
              </div>
              <span className="title text-xl">
                Youth Soccer Rankings
              </span>
            </Link>
            <nav className="flex items-center gap-8 text-sm font-medium">
              <Link
                href="/rankings"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Rankings
              </Link>
              <Link
                href="/states"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                States
              </Link>
              <Link
                href="/events"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Events
              </Link>
              <Link
                href="/power-rankings"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Power Rankings
              </Link>
              <Link
                href="/tools/flight-planner"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Flight Planner
              </Link>
              <Link
                href="/about"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                About
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border py-8 bg-footer text-footer-foreground">
          <div className="mx-auto max-w-7xl px-4 text-center text-sm">
            Youth Soccer Rankings USA &mdash; Powered by the Enhanced Massey
            Rating System
          </div>
        </footer>
      </body>
    </html>
  );
}
