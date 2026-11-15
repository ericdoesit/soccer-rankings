"use client";

import { MoonIcon, SunIcon } from "lucide-react";

/**
 * Light / dark switch at the right end of the header, in its own round pill.
 * The choice is saved in localStorage ("theme"); with no saved choice the site follows the
 * device setting. The <html> "dark" class is set before paint by the script in layout.tsx,
 * so the icons switch with CSS (dark:) and need no state here.
 */
export function ThemeToggle() {
  const toggle = () => {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch { /* private mode */ }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark mode"
      title="Light / dark mode"
      className="grid size-11 shrink-0 place-items-center rounded-full bg-card text-foreground shadow-[var(--surface-shadow)] transition-colors duration-300 ease-out outline-none hover:bg-muted hover:duration-150 focus-visible:ring-2 focus-visible:ring-ring active:bg-[var(--press)]"
    >
      <MoonIcon className="size-[18px] dark:hidden" strokeWidth={2} aria-hidden />
      <SunIcon className="hidden size-[18px] dark:block" strokeWidth={2} aria-hidden />
    </button>
  );
}
