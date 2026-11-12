import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runEmissionAlerts } from "@/lib/analytics/run-alerts";
import { runReminders } from "@/lib/reminders/run";

// Vercel Cron calls this once a day (vercel.json, 03:30 UTC = 09:00 India time) to send the day's deadline
// reminders (feature_enhancement.md Phase 5) and check emissions against their expected average (Phase 7). Vercel sends `Authorization: Bearer <CRON_SECRET>`; without
// CRON_SECRET set on the server nothing runs. Running twice sends nothing twice (lib/reminders/run.ts).

export const dynamic = "force-dynamic";
// Sending many emails one by one can take a while.
export const maxDuration = 300;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Reminders are not set up on this server." },
      { status: 503 },
    );
  }
  if (!authorised(request)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  const summary = await runReminders({ userId: null });
  // Phase 7: the emission threshold check rides on the same daily call (lib/analytics/run-alerts.ts).
  const alerts = await runEmissionAlerts({ userId: null });
  return NextResponse.json({ ...summary, alerts }, { headers: { "Cache-Control": "no-store" } });
}
