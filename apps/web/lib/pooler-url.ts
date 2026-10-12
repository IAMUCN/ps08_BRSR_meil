// Supabase's session pooler (port 5432) holds one database connection per client and allows only 15 in
// all. Serverless instances each open their own pool, so on Vercel the limit is reached within a few
// requests ("EMAXCONNSESSION") and every page that touches the database fails. On Vercel the transaction
// pooler (port 6543) is used instead, whatever port the setting names; everywhere else the URL is used
// as given. The app already sets `prepare: false`, which the transaction pooler requires.
//
// The pool is NOT made smaller there: with the transaction pooler and only three connections a report for
// a whole financial year (several queries at once) stalled until the function timed out, while the same
// report with five connections takes about two seconds. The transaction pooler allows many clients.
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
