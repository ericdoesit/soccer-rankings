import Link from "next/link";

/**
 * Phone name: the league is dropped (it shows as a tag) and the trailing age group split off, so
 * the club part can truncate while "U15" always shows.
 */
export function phoneName(name: string, program?: string | null): { base: string; age: string } {
  let base = name;
  if (program) {
    const esc = program.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    base = base.replace(new RegExp(`\\s${esc}(?=[\\s,-]|$)`, "i"), "");
  }
  base = base.replace(/,{2,}/g, ",").replace(/\s+/g, " ").trim();
  const m = base.match(/^(.*?)\s+(U\d{1,2})$/);
  return m ? { base: m[1], age: m[2] } : { base, age: "" };
}

/**
 * Team name for ranking tables: the full name from `sm` up; on phones one line that never wraps,
 * with `meta` (the columns phones hide) on a second line.
 */
export function TeamNameCell({
  id,
  name,
  program,
  meta,
  children,
}: {
  id: number;
  name: string;
  program?: string | null;
  /** second line on phones */
  meta?: React.ReactNode;
  /** shown after the name from `sm` up */
  children?: React.ReactNode;
}) {
  const { base, age } = phoneName(name, program);
  return (
    <>
      <div className="hidden sm:block">
        <Link href={`/team/${id}`} className="font-medium hover:text-primary transition-colors">{name}</Link>
        {children}
      </div>
      <Link
        href={`/team/${id}`}
        title={name}
        className="flex min-w-0 gap-1 text-[13px] font-medium tracking-[-0.01em] hover:text-primary transition-colors sm:hidden"
      >
        <span className="truncate">{base}</span>
        {age && <span className="shrink-0">{age}</span>}
      </Link>
      {meta && <div className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">{meta}</div>}
    </>
  );
}
