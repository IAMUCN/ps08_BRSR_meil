// Supabase's session pooler (port 5432) holds one database connection per client and allows only 15 in
// all. Serverless instances each open their own pool, so on Vercel the limit is reached within a few
// requests ("EMAXCONNSESSION") and every page that touches the database fails. On Vercel the transaction
// pooler (port 6543) is used instead, whatever port the setting names; everywhere else the URL is used
// as given. The app already sets `prepare: false`, which the transaction pooler requires.
export function serverlessPoolerUrl(
  url: string,
  env: Record<string, string | undefined> = process.env,
): string {
  if (!env.VERCEL) return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(".pooler.supabase.com") && (parsed.port || "5432") === "5432") {
      parsed.port = "6543";
      return parsed.toString();
    }
  } catch {
    // Not a URL we can read: leave it alone and let the driver report it.
  }
  return url;
}

/** Connections per instance: a serverless instance serves few requests at once, and many instances run. */
export const poolSize = (local: number, env: Record<string, string | undefined> = process.env) =>
  env.VERCEL ? Math.min(local, 3) : local;
