import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { adminProcedure, router } from "@/lib/trpc/init";

// Demo requests from the landing page (migration 0066, D56, A55): listed for Super Admins, who mark the ones
// they have contacted. The request itself is made by app/demo-request/actions.ts.

export type DemoRequest = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  contactedAt: string | null;
  contactedBy: string | null;
};

export const demoRequestsRouter = router({
  list: adminProcedure.query(async (): Promise<DemoRequest[]> => {
    const rows = await db()<
      {
        id: string;
        name: string;
        email: string;
        phone: string;
        created_at: Date;
        contacted_at: Date | null;
        contacted_by: string | null;
      }[]
    >`
      select d.id, d.name, d.email, d.phone, d.created_at, d.contacted_at, u.display_name as contacted_by
      from public.demo_requests d left join public.users u on u.id = d.contacted_by
      order by d.created_at desc limit 500`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      createdAt: r.created_at.toISOString(),
      contactedAt: r.contacted_at?.toISOString() ?? null,
      contactedBy: r.contacted_by,
    }));
  }),

  /** Mark a request as contacted, or undo that. Audited. */
  setContacted: adminProcedure
    .input(z.object({ id: z.uuid(), contacted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const [row] = await tx<{ contacted_at: Date | null }[]>`
          select contacted_at from public.demo_requests where id = ${input.id} for update`;
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "That request no longer exists." });
        if ((row.contacted_at !== null) === input.contacted) return;
        await tx`
          update public.demo_requests
          set contacted_at = ${input.contacted ? new Date() : null},
              contacted_by = ${input.contacted ? ctx.session.userId : null}
          where id = ${input.id}`;
        await writeAudit(tx, {
          eventType: input.contacted ? "demo_request.contacted" : "demo_request.reopened",
          entityType: "demo_request",
          entityId: input.id,
          userId: ctx.session.userId,
          oldValue: { contacted: row.contacted_at !== null },
          newValue: { contacted: input.contacted },
        });
      });
      return null;
    }),
});
