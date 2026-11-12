import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { sessionIdForNotice } from "@/lib/auth/session-cookie";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

// Next.js 16 proxy (formerly middleware). Refreshes the Supabase session cookie on every request and
// performs optimistic redirects only. Authorization (is_active, role, scope) happens in the Data Access
// Layer (lib/auth/session.ts) and in RLS — never here alone.

const PROTECTED_PREFIXES = ["/admin", "/app"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  const hadAuthCookie = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));

  // Read before the Supabase client may clear them: a refused session's cookie still names the sign-in.
  const originalCookies = request.cookies.getAll();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Validates the access token and refreshes it if expired (writes new cookies via setAll).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  // A Server Action is not redirected here: the browser would re-send it to /login, where it silently does
  // nothing. It reaches its procedure, which refuses it, and runAction sends the user to sign in (§4.3).
  const isServerAction = request.method === "POST" && request.headers.has("next-action");

  if (!signedIn && isProtected(pathname) && !isServerAction) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    // §4.3: a cookie that no longer yields a valid session means the session expired.
    if (hadAuthCookie) {
      const takenOverAt = await replacedAtQuietly(sessionIdForNotice(originalCookies));
      if (takenOverAt) {
        // Taken over by another device (migration 0055): say so, with the time, instead of "expired".
        loginUrl.searchParams.set("reason", "replaced");
        loginUrl.searchParams.set("at", takenOverAt);
      } else {
        loginUrl.searchParams.set("reason", "expired");
      }
    }
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  if (isProtected(pathname)) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  return response;
}

/** The database lookup must never stop a page from loading: if it fails, the notice is just "expired". */
async function replacedAtQuietly(sessionId: string | null): Promise<string | null> {
  if (!sessionId) return null;
  try {
    const { replacedAt } = await import("@/lib/auth/session-limits");
    return await replacedAt(sessionId);
  } catch {
    return null;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
