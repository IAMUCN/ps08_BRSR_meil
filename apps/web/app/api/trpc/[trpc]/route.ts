import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { NextResponse } from "next/server";
import { sameOriginRequest } from "@/lib/security/origin";
import { createTRPCContext } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/root";

function handler(request: Request) {
  // CSRF: mutations only from this app's own pages (SECURITY_REVIEW.md).
  const allowed = sameOriginRequest({
    method: request.method,
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
  });
  if (!allowed) {
    return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  }
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: createTRPCContext,
    // Answers carry a signed-in person's data: never stored by a browser or anything in between, and — as
    // JSON that is never a page — allowed to load nothing and be framed by nobody. (next.config.ts leaves
    // /api without the site-wide policy so a route can set its own.)
    responseMeta: () => ({
      headers: new Headers([
        ["cache-control", "private, no-store"],
        ["content-security-policy", "default-src 'none'; frame-ancestors 'none'"],
      ]),
    }),
  });
}

export { handler as GET, handler as POST };
