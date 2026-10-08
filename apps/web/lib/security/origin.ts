// CSRF protection for the tRPC endpoint (.grill/phase-18-audit-security-decisions.md): a state-changing
// request from a browser must come from this app's own host. Next.js applies the same rule to Server Actions;
// tRPC is a plain route handler, so it gets it here. Pure, so the rule is unit-tested.

export function sameOriginRequest(input: {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
  forwardedHost: string | null;
}): boolean {
  if (input.method === "GET" || input.method === "HEAD" || input.method === "OPTIONS") return true;
  const host = (input.forwardedHost ?? input.host ?? "").split(",")[0].trim().toLowerCase();
  if (input.origin) {
    try {
      return new URL(input.origin).host.toLowerCase() === host;
    } catch {
      return false; // "null" or a malformed origin
    }
  }
  // No Origin header: non-browser clients carry no ambient cookies worth forging. A browser that says the
  // request is cross-site is refused.
  return input.secFetchSite !== "cross-site";
}
