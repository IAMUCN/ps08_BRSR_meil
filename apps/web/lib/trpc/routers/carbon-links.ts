import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { httpsTransport, type Transport } from "@/lib/factors/source";
import { checkLink } from "@/lib/factors/source-text";
import { adminProcedure, carbonViewProcedure, router } from "@/lib/trpc/init";

// Where carbon credits can be explored or traded (feature_enhancement.md 6.3, requirement 35; D50, A46). Outside
// sites only: EmeilSG does not sell, certify or guarantee credits, and the page says so. A Super Admin keeps the
// list; "Check addresses" requests each one (https, public addresses only, redirects followed and re-checked) and
// records when, the answer and where it ended.

export type CarbonLink = {
  id: string;
  name: string;
  url: string;
  host: string;
  description: string;
  kind: "india_official" | "exchange" | "registry";
  position: number;
  active: boolean;
  checkedAt: string | null;
  checkStatus: number | null;
  checkFinalUrl: string | null;
};

const fields = {
  name: z.string().trim().min(2).max(120),
  url: z.string().trim().max(500),
  description: z.string().trim().min(2).max(500),
  kind: z.enum(["india_official", "exchange", "registry"]),
  position: z.number().int().min(0).max(1000).optional(),
};

const linkOf = (raw: string) => {
  const link = checkLink(raw);
  if (!link.ok) throw new TRPCError({ code: "BAD_REQUEST", message: link.reason });
  return link.url.toString();
};

/** Request a link and follow up to three redirects, each re-checked. Status 0 when nothing answered. */
export async function checkAddress(
  url: string,
  transport: Transport = httpsTransport(),
): Promise<{ status: number; finalUrl: string; error: string | null }> {
  let current = new URL(url);
  for (let hop = 0; hop <= 3; hop += 1) {
    try {
      const res = await transport(current);
      if (res.status >= 300 && res.status < 400 && res.location) {
        const next = checkLink(new URL(res.location, current).toString());
        if (!next.ok)
          return { status: res.status, finalUrl: current.toString(), error: next.reason };
        current = next.url;
        continue;
      }
      return { status: res.status, finalUrl: current.toString(), error: null };
    } catch (error) {
      return {
        status: 0,
        finalUrl: current.toString(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return { status: 0, finalUrl: current.toString(), error: "Too many redirects." };
}

const select = (sql: ReturnType<typeof db>, all: boolean) => sql<
  {
    id: string;
    name: string;
    url: string;
    description: string;
    kind: CarbonLink["kind"];
    position: number;
    active: boolean;
    checked_at: string | null;
    check_status: number | null;
    check_final_url: string | null;
  }[]
>`
  select id, name, url, description, kind, position, active, checked_at, check_status, check_final_url
  from public.carbon_credit_links
  where ${all ? sql`true` : sql`active`}
  order by position, name`;

export const carbonLinksRouter = router({
  /** The list as anyone who can see carbon credits sees it (active links only); a Super Admin sees all. */
  list: carbonViewProcedure.query(async ({ ctx }): Promise<CarbonLink[]> => {
    const rows = await select(db(), ctx.session.isAdmin);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      host: new URL(r.url).hostname,
      description: r.description,
      kind: r.kind,
      position: r.position,
      active: r.active,
      checkedAt: r.checked_at,
      checkStatus: r.check_status,
      checkFinalUrl: r.check_final_url,
    }));
  }),

  create: adminProcedure.input(z.object(fields)).mutation(async ({ ctx, input }) => {
    const url = linkOf(input.url);
    return db().begin(async (tx) => {
      const [dup] = await tx`select 1 from public.carbon_credit_links where url = ${url}`;
      if (dup)
        throw new TRPCError({ code: "CONFLICT", message: "That address is already on the list." });
      const [row] = await tx<{ id: string }[]>`
        insert into public.carbon_credit_links
          (name, url, description, kind, position, created_by, updated_by)
        values (${input.name}, ${url}, ${input.description}, ${input.kind},
                ${input.position ?? 100}, ${ctx.session.userId}, ${ctx.session.userId})
        returning id`;
      await writeAudit(tx, {
        eventType: "carbon_link.created",
        entityType: "carbon_credit_link",
        entityId: row.id,
        userId: ctx.session.userId,
        newValue: { ...input, url },
      });
      return { id: row.id };
    });
  }),

  update: adminProcedure
    .input(z.object({ id: z.uuid(), active: z.boolean(), ...fields }))
    .mutation(async ({ ctx, input }) => {
      const url = linkOf(input.url);
      await db().begin(async (tx) => {
        const [old] = await tx<{ url: string; name: string; active: boolean }[]>`
          select url, name, active from public.carbon_credit_links where id = ${input.id} for update`;
        if (!old) throw new TRPCError({ code: "NOT_FOUND", message: "Link not found." });
        const [dup] = await tx`
          select 1 from public.carbon_credit_links where url = ${url} and id <> ${input.id}`;
        if (dup)
          throw new TRPCError({
            code: "CONFLICT",
            message: "That address is already on the list.",
          });
        await tx`
          update public.carbon_credit_links
          set name = ${input.name}, url = ${url}, description = ${input.description}, kind = ${input.kind},
              position = ${input.position ?? 100}, active = ${input.active},
              updated_by = ${ctx.session.userId}, updated_at = now(),
              -- A new address has not been checked yet.
              checked_at = case when url = ${url} then checked_at end,
              check_status = case when url = ${url} then check_status end,
              check_final_url = case when url = ${url} then check_final_url end
          where id = ${input.id}`;
        await writeAudit(tx, {
          eventType: "carbon_link.updated",
          entityType: "carbon_credit_link",
          entityId: input.id,
          userId: ctx.session.userId,
          oldValue: old,
          newValue: { ...input, url },
        });
      });
      return null;
    }),

  remove: adminProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    await db().begin(async (tx) => {
      const [old] = await tx<{ name: string; url: string }[]>`
        delete from public.carbon_credit_links where id = ${input.id} returning name, url`;
      if (!old) throw new TRPCError({ code: "NOT_FOUND", message: "Link not found." });
      await writeAudit(tx, {
        eventType: "carbon_link.removed",
        entityType: "carbon_credit_link",
        entityId: input.id,
        userId: ctx.session.userId,
        oldValue: old,
      });
    });
    return null;
  }),

  /** Request every address on the list and record the answer. */
  check: adminProcedure.mutation(async ({ ctx }) => {
    const sql = db();
    const links = await select(sql, true);
    const results = await Promise.all(
      links.map(async (l) => ({ id: l.id, name: l.name, ...(await checkAddress(l.url)) })),
    );
    await sql.begin(async (tx) => {
      for (const r of results) {
        await tx`
          update public.carbon_credit_links
          set checked_at = now(), check_status = ${r.status}, check_final_url = ${r.finalUrl.slice(0, 500)}
          where id = ${r.id}`;
      }
      await writeAudit(tx, {
        eventType: "carbon_link.checked",
        entityType: "carbon_credit_link",
        entityId: links[0]?.id ?? ctx.session.userId,
        userId: ctx.session.userId,
        newValue: {
          results: results.map((r) => ({ name: r.name, status: r.status, error: r.error })),
        },
      });
    });
    return results.map((r) => ({ name: r.name, status: r.status, error: r.error }));
  }),
});
