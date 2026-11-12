import "server-only";
import { publicEnv } from "@/lib/env";

/**
 * Whether Supabase Auth has the Google provider switched on (its public settings endpoint). "Continue with
 * Google" is shown only then: pressed while it is off, Supabase answers with a bare error page. Asked at most
 * every five minutes; any failure counts as off.
 */
export async function googleSignInEnabled(): Promise<boolean> {
  try {
    const response = await fetch(`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const settings = (await response.json()) as { external?: { google?: boolean } };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}
