"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { reportActivity, sessionClock } from "@/lib/auth/session-actions";
import type { SessionClock } from "@/lib/auth/session-limits";

// Session time limits, the browser's half (migration 0052). The server ends a sign-in after a period
// without activity and a fixed time after it started, and checks that on every request. This component
//   - tells the server when the person really does something (at most once a minute), which is the only
//     thing that moves the idle clock: the page's own polling does not;
//   - warns a few minutes before the sign-in ends, so nobody is cut off without notice;
//   - leaves for the sign-in page when it has ended, instead of showing data over a dead session.
// It decides nothing: the server's answer is the truth, also when another tab has been busy meanwhile.

const HEARTBEAT_MS = 60_000;
const TICK_MS = 15_000;
const WARN_MS = 5 * 60_000;
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

type Warning = { kind: "idle" | "absolute"; endsAt: number };

function timeOfDay(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function SessionKeeper() {
  const [warning, setWarning] = useState<Warning | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const stay = useRef<() => void>(() => {});

  useEffect(() => {
    // Server times; `offset` turns this device's clock into the server's.
    let idleAt = 0;
    let absoluteAt = 0;
    let offset = 0;
    let lastSent = 0;
    let unsentActivity = false;
    let busy = false;
    let confirmedNearEnd = false;
    let leaving = false;

    const leave = () => {
      if (leaving) return;
      leaving = true;
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      // A route that clears the session cookies, not a page: it needs a real navigation.
      window.location.href = `/auth/signout?reason=expired&next=${next}`;
    };

    // `fresh`: the server has just answered, so what this tab knows is current. Otherwise it may be stale
    // (another tab was in use meanwhile), and the server is asked before warning or leaving.
    const evaluate = (fresh: boolean) => {
      if (!idleAt) return;
      const now = Date.now() + offset;
      const endsAt = Math.min(idleAt, absoluteAt);
      const remaining = endsAt - now;
      if (remaining <= 0) {
        if (!fresh) void ask(false);
      } else if (remaining <= WARN_MS) {
        if (!fresh && !confirmedNearEnd) {
          confirmedNearEnd = true;
          void ask(false);
          return;
        }
        confirmedNearEnd = true;
        setWarning({ kind: idleAt <= absoluteAt ? "idle" : "absolute", endsAt: endsAt - offset });
      } else {
        confirmedNearEnd = false;
        setWarning(null);
      }
    };

    const apply = (clock: SessionClock) => {
      if (clock.state === "expired") return leave();
      idleAt = Date.parse(clock.idleExpiresAt);
      absoluteAt = Date.parse(clock.absoluteExpiresAt);
      offset = Date.parse(clock.now) - Date.now();
      evaluate(true);
    };

    async function ask(activity: boolean) {
      if (busy) {
        if (activity) unsentActivity = true;
        return;
      }
      busy = true;
      try {
        apply(await (activity ? reportActivity() : sessionClock()));
      } catch {
        // Offline or a server hiccup: say nothing and try again on the next tick. The server still
        // enforces the limits on whatever request comes next.
        if (activity) unsentActivity = true;
      } finally {
        busy = false;
      }
    }

    const sendActivity = () => {
      lastSent = Date.now();
      unsentActivity = false;
      void ask(true);
    };

    const onActivity = () => {
      if (Date.now() - lastSent >= HEARTBEAT_MS) sendActivity();
      else unsentActivity = true;
    };

    const tick = () => {
      if (unsentActivity && Date.now() - lastSent >= HEARTBEAT_MS) sendActivity();
      else evaluate(false);
    };

    stay.current = sendActivity;
    const first = setTimeout(() => void ask(false), 0);
    const timer = setInterval(tick, TICK_MS);
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, onActivity, { passive: true, capture: true });
    }
    // A tab that was asleep (a closed laptop) wakes with stale timers: look at the clock at once.
    const onVisible = () => document.visibilityState === "visible" && void ask(false);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(first);
      clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, onActivity, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!warning || dismissedAt === warning.endsAt) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-4 top-20 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-3 rounded-md border bg-card px-4 py-3 text-sm leading-5 text-card-foreground shadow-lg"
    >
      {warning.kind === "idle" ? (
        <>
          <p>
            You will be signed out at {timeOfDay(warning.endsAt)} because nothing has been done here
            for a while.
          </p>
          <Button size="sm" onClick={() => stay.current()}>
            Stay signed in
          </Button>
        </>
      ) : (
        <>
          <p>
            This sign-in ends at {timeOfDay(warning.endsAt)}. Finish what you are doing; you will be
            asked to sign in again.
          </p>
          <Button size="sm" variant="outline" onClick={() => setDismissedAt(warning.endsAt)}>
            OK
          </Button>
        </>
      )}
    </div>
  );
}
