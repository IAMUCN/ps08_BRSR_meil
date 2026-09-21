import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db, pgErrorCode, type Tx } from "@/lib/db";
import {
  canBeChildOf,
  checkMove,
  descendantIds,
  isFrozen,
  ORG_UNIT_TYPES,
  type OrgNode,
} from "@/lib/org/rules";
import { permissionProcedure, router } from "@/lib/trpc/init";

const orgManage = permissionProcedure("org.manage");

export type OrgExpectation = {
  metricId: string;
  metricName: string;
  categoryName: string;
  frequency: string;
  expected: boolean;
};

export type OrgUnitRow = OrgNode & { name: string; code: string | null; activeAssignments: number };

const nameSchema = z.string().trim().min(1, "Name is required.").max(200);
const codeSchema = z
  .string()
  .trim()
  .max(50)
  .regex(/^[A-Za-z0-9-_]*$/, "Code may contain letters, numbers, hyphens and underscores only.")
  .transform((value) => (value === "" ? null : value));

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

/** Serialises structural tree changes so concurrent moves/creates can't race each other. */
async function loadTreeForUpdate(tx: Tx): Promise<OrgNode[]> {
  await tx`select pg_advisory_xact_lock(hashtext('org_units_tree'))`;
  const rows = await tx<
    { id: string; parent_id: string | null; unit_type: string; status: string }[]
  >`
    select id, parent_id, unit_type, status from public.org_units where deleted_at is null`;
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    unitType: r.unit_type as OrgNode["unitType"],
    status: r.status as OrgNode["status"],
  }));
}

async function subtreeImpact(nodeId: string, nodes: OrgNode[]) {
  const ids = [nodeId, ...descendantIds(nodeId, nodes)];
  const sql = db();
  const [{ assignments }] = await sql<{ assignments: number }[]>`
    select count(*)::int as assignments from public.user_org_assignments
    where revoked_at is null and org_unit_id = any(${ids}::uuid[])`;
  const [{ records }] = await sql<{ records: number }[]>`
    select count(*)::int as records from public.esg_records
    where org_unit_id = any(${ids}::uuid[]) and approval_status not in ('approved', 'rejected')`;
  return {
    descendants: ids.length - 1,
    activeAssignments: assignments,
    inProgressRecords: records,
  };
}

export const organizationRouter = router({
  tree: orgManage.query(async (): Promise<OrgUnitRow[]> => {
    const rows = await db()<
      {
        id: string;
        parent_id: string | null;
        unit_type: string;
        status: string;
        name: string;
        code: string | null;
        active_assignments: number;
      }[]
    >`
      select ou.id, ou.parent_id, ou.unit_type, ou.status, ou.name, ou.code,
             (select count(*)::int from public.user_org_assignments uoa
              where uoa.org_unit_id = ou.id and uoa.revoked_at is null) as active_assignments
      from public.org_units ou
      where ou.deleted_at is null
      order by ou.name`;
    return rows.map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      unitType: r.unit_type as OrgNode["unitType"],
      status: r.status as OrgNode["status"],
      name: r.name,
      code: r.code,
      activeAssignments: r.active_assignments,
    }));
  }),

  impact: orgManage.input(z.object({ id: z.uuid() })).query(async ({ input }) => {
    const rows = await db()<
      { id: string; parent_id: string | null; unit_type: string; status: string }[]
    >`
      select id, parent_id, unit_type, status from public.org_units where deleted_at is null`;
    const nodes: OrgNode[] = rows.map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      unitType: r.unit_type as OrgNode["unitType"],
      status: r.status as OrgNode["status"],
    }));
    return subtreeImpact(input.id, nodes);
  }),

  create: orgManage
    .input(
      z.object({
        parentId: z.uuid(),
        unitType: z.enum(ORG_UNIT_TYPES),
        name: nameSchema,
        code: codeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await db().begin(async (tx) => {
          const nodes = await loadTreeForUpdate(tx);
          const parent = nodes.find((n) => n.id === input.parentId);
          if (!parent) badRequest("Parent node not found.");
          if (isFrozen(parent.id, nodes)) {
            badRequest("That node is inactive (or under an inactive node) — reactivate it first.");
          }
          if (!canBeChildOf(parent.unitType, input.unitType)) {
            badRequest("That level can't be placed under the selected parent.");
          }
          const [created] = await tx<{ id: string }[]>`
            insert into public.org_units (parent_id, unit_type, name, code)
            values (${parent.id}, ${input.unitType}, ${input.name}, ${input.code})
            returning id`;
          await writeAudit(tx, {
            eventType: "org_unit.created",
            entityType: "org_unit",
            entityId: created.id,
            userId: ctx.session.userId,
            newValue: {
              parent_id: parent.id,
              unit_type: input.unitType,
              name: input.name,
              code: input.code,
            },
          });
          return { id: created.id };
        });
      } catch (error) {
        if (pgErrorCode(error) === "23505")
          badRequest("That code is already used by another node.");
        throw error;
      }
    }),

  update: orgManage
    .input(z.object({ id: z.uuid(), name: nameSchema, code: codeSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db().begin(async (tx) => {
          const [before] = await tx<{ name: string; code: string | null }[]>`
            select name, code from public.org_units where id = ${input.id} and deleted_at is null for update`;
          if (!before) badRequest("Node not found.");
          await tx`update public.org_units set name = ${input.name}, code = ${input.code} where id = ${input.id}`;
          await writeAudit(tx, {
            eventType: "org_unit.updated",
            entityType: "org_unit",
            entityId: input.id,
            userId: ctx.session.userId,
            oldValue: before,
            newValue: { name: input.name, code: input.code },
          });
        });
        return null;
      } catch (error) {
        if (pgErrorCode(error) === "23505")
          badRequest("That code is already used by another node.");
        throw error;
      }
    }),

  move: orgManage
    .input(z.object({ id: z.uuid(), newParentId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const nodes = await loadTreeForUpdate(tx);
        const node = nodes.find((n) => n.id === input.id);
        const check = checkMove(input.id, input.newParentId, nodes);
        if (!check.ok) badRequest(check.reason);
        if (node!.parentId === input.newParentId)
          badRequest("The node is already under that parent.");
        if (isFrozen(input.newParentId, nodes)) {
          badRequest("The new parent is inactive (or under an inactive node).");
        }
        await tx`update public.org_units set parent_id = ${input.newParentId} where id = ${input.id}`;
        await writeAudit(tx, {
          eventType: "org_unit.moved",
          entityType: "org_unit",
          entityId: input.id,
          userId: ctx.session.userId,
          oldValue: { parent_id: node!.parentId },
          newValue: { parent_id: input.newParentId },
        });
      });
      return null;
    }),

  setStatus: orgManage
    .input(z.object({ id: z.uuid(), status: z.enum(["active", "inactive"]) }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const nodes = await loadTreeForUpdate(tx);
        const node = nodes.find((n) => n.id === input.id);
        if (!node) badRequest("Node not found.");
        if (node.parentId === null && input.status === "inactive") {
          badRequest("The root organization can't be deactivated.");
        }
        if (node.status === input.status) badRequest(`The node is already ${input.status}.`);
        const impact = await subtreeImpact(input.id, nodes);
        await tx`update public.org_units set status = ${input.status} where id = ${input.id}`;
        await writeAudit(tx, {
          eventType: input.status === "inactive" ? "org_unit.deactivated" : "org_unit.reactivated",
          entityType: "org_unit",
          entityId: input.id,
          userId: ctx.session.userId,
          oldValue: { status: node.status },
          newValue: { status: input.status, impact },
        });
      });
      return null;
    }),

  /** Which metrics this node must submit each period (Control Tower denominators, D16). */
  expectations: orgManage
    .input(z.object({ orgUnitId: z.uuid() }))
    .query(async ({ input }): Promise<OrgExpectation[]> => {
      const rows = await db()<
        { id: string; name: string; category_name: string; frequency: string; expected: boolean }[]
      >`
        select m.id, m.name, c.name as category_name, m.frequency::text,
               exists (select 1 from public.submission_expectations e
                        where e.org_unit_id = ${input.orgUnitId} and e.metric_id = m.id) as expected
        from public.esg_metrics m join public.esg_categories c on c.id = m.category_id
        where m.deleted_at is null
        order by c.name, m.name`;
      return rows.map((r) => ({
        metricId: r.id,
        metricName: r.name,
        categoryName: r.category_name,
        frequency: r.frequency,
        expected: r.expected,
      }));
    }),

  setExpectation: orgManage
    .input(z.object({ orgUnitId: z.uuid(), metricId: z.uuid(), expected: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const [unit] = await tx<{ id: string }[]>`
          select id from public.org_units where id = ${input.orgUnitId} and deleted_at is null`;
        if (!unit) badRequest("Node not found.");
        const changed = input.expected
          ? await tx`
              insert into public.submission_expectations (org_unit_id, metric_id, created_by)
              values (${input.orgUnitId}, ${input.metricId}, ${ctx.session.userId})
              on conflict (org_unit_id, metric_id) do nothing returning id`
          : await tx`
              delete from public.submission_expectations
              where org_unit_id = ${input.orgUnitId} and metric_id = ${input.metricId} returning id`;
        if (changed.length === 0) return;
        await writeAudit(tx, {
          eventType: input.expected ? "expectation.added" : "expectation.removed",
          entityType: "org_unit",
          entityId: input.orgUnitId,
          userId: ctx.session.userId,
          newValue: { metric_id: input.metricId, expected: input.expected },
        });
      });
      return null;
    }),
});
