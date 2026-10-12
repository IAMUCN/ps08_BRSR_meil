// The address people reach the app at, for links in emails. Set NEXT_PUBLIC_APP_URL in production (a custom
// domain); without it a Vercel deployment falls back to the project's production address.
export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}
