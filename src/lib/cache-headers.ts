/**
 * The data only changes with a deploy (weekly refresh → data release → redeploy), and Vercel's CDN
 * cache is cleared on every deployment, so read-only API answers can sit at the edge until then:
 * repeat requests skip the function (and its cold start, which parses the ~110 MB snapshot).
 * Browsers keep a copy for 5 minutes.
 */
export const DATA_CACHE = { "Cache-Control": "public, max-age=300, s-maxage=604800, stale-while-revalidate=86400" };
