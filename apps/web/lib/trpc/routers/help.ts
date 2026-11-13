import "server-only";
import { db } from "@/lib/db";
import { readAlertSettings } from "@/lib/analytics/alerts";
import { permissionLabel } from "@/lib/roles/permission-labels";
import { protectedProcedure, router } from "@/lib/trpc/init";

// The help centre (feature_enhancement.md 10.1, requirement 21; A49) quotes the platform's own settings, roles
// and hierarchy levels as they are configured, so it never describes a limit or a role that is not in force.
// Nothing here is personal: open to every signed-in person.

export type HelpFacts = {
  ocrThreshold: number;
  session: { idleMinutes: number; absoluteMinutes: number };
  invitationHours: number;
  uploadsPerUser: number;
  uploadWindowMinutes: number;
  reminderDays: { before: number; email: boolean }[];
  alerts: {
    enabled: boolean;
    thresholdPct: Record<string, number>;
    minBaselineYears: number;
    lookbackDays: number;
  };
  superAdminLimit: number;
  roles: { code: string; name: string; description: string | null; permissions: string[] }[];
  levels: string[];
};

const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export const helpRouter = router({
  facts: protectedProcedure.query(async (): Promise<HelpFacts> => {
    const sql = db();
    const [settings, roles, levels] = await Promise.all([
      sql<{ key: string; value: unknown }[]>`select key, value from public.org_settings`,
      sql<{ code: string; name: string; description: string | null; permissions: string[] }[]>`
        select r.code, r.name, r.description,
               coalesce(array_agg(p.code order by p.code) filter (where p.code is not null), '{}') as permissions
        from public.roles r
        left join public.role_permissions rp on rp.role_id = r.id
        left join public.permissions p on p.id = rp.permission_id
        group by r.id, r.code, r.name, r.description
        order by r.code = 'admin' desc, r.code = 'org_admin' desc, r.code = 'bu_manager' desc, r.name`,
      sql<{ label: string }[]>`select label from public.org_levels order by sort_order`,
    ]);
    const get = (key: string) =>
      settings.find((s) => s.key === key)?.value as Record<string, unknown> | number | undefined;
    const session = (get("session_limits") ?? {}) as Record<string, unknown>;
    const limits = (get("rate_limits") ?? {}) as Record<string, unknown>;
    const schedule = (get("reminder_schedule") ?? {}) as {
      days?: { before: number; email: boolean }[];
    };
    const alerts = readAlertSettings(get("emission_alert_settings"));
    return {
      ocrThreshold: num(get("ocr_confidence_threshold"), 80),
      session: {
        idleMinutes: num(session.idle_minutes, 180),
        absoluteMinutes: num(session.absolute_minutes, 720),
      },
      invitationHours: num(get("invitation_valid_hours"), 24),
      uploadsPerUser: num(limits.uploads_per_user, 60),
      uploadWindowMinutes: num(limits.upload_window_minutes, 10),
      reminderDays: Array.isArray(schedule.days) ? schedule.days : [],
      alerts: {
        enabled: alerts.enabled,
        thresholdPct: alerts.thresholdPct,
        minBaselineYears: alerts.minBaselineYears,
        lookbackDays: alerts.lookbackDays,
      },
      superAdminLimit: num(get("super_admin_limit"), 2),
      roles: roles.map((r) => ({ ...r, permissions: r.permissions.map(permissionLabel) })),
      levels: levels.map((l) => l.label),
    };
  }),
});
