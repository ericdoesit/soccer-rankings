import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { TableSorter } from "@/components/table-sorter";
import { SiteNav } from "@/components/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";

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
        {/* dark mode before first paint: the saved choice, else the device setting (see ThemeToggle) */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}` }} />
        {/* Switzer (Indian Type Foundry, free licence) for headings and big numbers */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <header className="sticky top-0 z-50 bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <span className="flex h-8 items-center justify-center rounded-full bg-foreground px-2.5 text-[11px] font-semibold tracking-wide text-background">
                YSR
              </span>
              <span className="heading-sm hidden lg:inline">Youth Soccer Rankings</span>
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              <SiteNav />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <TableSorter />
        <footer className="mt-16 bg-footer text-footer-foreground">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-t border-[var(--surface-line)] px-4 py-8">
            <p className="heading-sm text-foreground">
              Ranked by results. <span className="tail">Nothing else.</span>
            </p>
            <nav aria-label="Footer" className="flex flex-wrap gap-2 text-sm">
              {[["/rankings", "Rankings"], ["/events", "Events"], ["/about", "How it works"]].map(([href, label]) => (
                <Link key={href} href={href} className="rounded-full bg-card px-3.5 py-1.5 shadow-[var(--surface-shadow)] transition-colors hover:text-foreground">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
