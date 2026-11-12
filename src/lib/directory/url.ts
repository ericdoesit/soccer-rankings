/**
 * Clean a website link from a league / association list:
 * "www.napaunited.org" → "https://www.napaunited.org", "http://https//x.com" → "https://x.com".
 * Returns null for things that aren't web addresses.
 */
export function normalizeWebsite(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u = raw.trim().replace(/\s+/g, "");
  if (!u || /^(mailto:|tel:|javascript:|#)/i.test(u)) return null;
  u = u.replace(/^https?:\/\/(https?)\/\//i, "$1://").replace(/^(https?):\/\/(https?):\/\//i, "$2://");
  if (!/^https?:\/\//i.test(u)) u = `https://${u.replace(/^\/+/, "")}`;
  try {
    const url = new URL(u);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch { return null; }
}
