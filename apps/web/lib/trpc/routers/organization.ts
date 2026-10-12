import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { ActiveSession } from "@/lib/auth/session";
import { db, pgErrorCode, type Tx } from "@/lib/db";
import {
  canBeChildOf,
  checkAlsoUnder,
  checkMove,
  descendantIds,
  importOrder,
  mergeSharedRows,
  isFrozen,
  reachableNodeIds,
  ROOT_LEVEL,
  unitByRef,
  type OrgLevel,
  type OrgNode,
} from "@/lib/org/rules";
import { loadLevels } from "@/lib/org/levels";
import { loadOrgNodes, type OrgNodeRow } from "@/lib/org/nodes";
import { permissionProcedure, protectedProcedure, router } from "@/lib/trpc/init";

const orgManage = permissionProcedure("org.manage");
const orgBulkImport = permissionProcedure("org.bulk_import");

export type OrgExpectation = {
  metricId: string;
  metricName: string;
  categoryName: string;
  /** "Scope 1", "Scope 2", "Scope 3", or null for activities outside the three scopes. */
  scopeName: string | null;
  frequency: string;
  /** Set on this unit itself. */
  expected: boolean;
  /** Units below this one that must submit it — it then counts as expected here too. */
  requiredBelow: string[];
};

export type OrgUnitRow = OrgNodeRow & { activeAssignments: number };

/** What stands in the way of deleting a unit for good, and how many units would go. */
export type OrgDeleteCheck = { units: number; blockers: string[] };

const nameSchema = z.string().trim().min(1, "Name is required.").max(200);
const codeSchema = z
  .string()
  .trim()
  .max(50)
  .regex(/^[A-Za-z0-9-_]*$/, "Code may contain letters, numbers, hyphens and underscores only.")
  .transform((value) => (value === "" ? null : value));

/** A configured level code; whether it exists and fits under the parent is checked against `org_levels`. */
const levelCode = z.string().trim().min(1).max(40);
const levelLabelSchema = z.string().trim().min(2, "Give the level a name.").max(60);

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

/** Serialises structural tree changes so concurrent moves/creates can't race each other. */
async function loadTreeForUpdate(tx: Tx): Promise<OrgNodeRow[]> {
  await tx`select pg_advisory_xact_lock(hashtext('org_units_tree'))`;
  return loadOrgNodes(tx);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Deleting for good is only for a unit nobody has used: it and everything managed under it must have no
 * person ever assigned, no document, no record and no report. Anything used is deactivated instead, so its
 * history stays. A group may go only while another group remains.
 */
async function deleteCheck(
  sql: Tx | ReturnType<typeof db>,
  nodeId: string,
  nodes: readonly OrgNode[],
): Promise<OrgDeleteCheck & { ids: string[] }> {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) badRequest("Node not found.");
  const ids = [nodeId, ...descendantIds(nodeId, nodes)];
  const [used] = await sql<
    { assignments: number; documents: number; records: number; reports: number }[]
  >`
    select
      (select count(*)::int from public.user_org_assignments where org_unit_id = any(${ids}::uuid[])) as assignments,
      (select count(*)::int from public.documents where org_unit_id = any(${ids}::uuid[])) as documents,
      (select count(*)::int from public.esg_records where org_unit_id = any(${ids}::uuid[])) as records,
      (select count(*)::int from public.report_runs where org_unit_id = any(${ids}::uuid[])) as reports`;
  const blockers: string[] = [];
  if (node.parentId === null && nodes.filter((n) => n.parentId === null).length < 2) {
    blockers.push("It is the only group; one group must remain.");
  }
  if (used.assignments) {
    blockers.push(
      `${plural(used.assignments, "role assignment names", "role assignments name")} it or a unit under it (past ones count: they are part of the history).`,
    );
  }
  if (used.documents)
    blockers.push(`${plural(used.documents, "document was", "documents were")} uploaded there.`);
  if (used.records)
    blockers.push(`${plural(used.records, "record belongs", "records belong")} there.`);
  if (used.reports)
    blockers.push(`${plural(used.reports, "report was", "reports were")} generated for it.`);
  return { units: ids.length, blockers, ids };
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
  /**
   * The configured hierarchy levels, in order (migration 0037; PRD §11: a level is configuration). Any
   * signed-in user may read them — they are the labels of the tree everyone already sees.
   */
  levels: protectedProcedure.query((): Promise<OrgLevel[]> => loadLevels(db())),

  /** A new level, placed directly after an existing one. Nothing moves: existing units keep their levels. */
  addLevel: orgManage
    .input(z.object({ label: levelLabelSchema, afterCode: levelCode }))
    .mutation(async ({ ctx, input }) => {
      // The code is derived from the name once and never changes; the label can be renamed later.
      const code = input.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      if (!/^[a-z][a-z0-9_]{1,39}$/.test(code)) {
        badRequest(
          "A level name must start with a letter and have at least two letters or digits.",
        );
      }
      return db().begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext('org_units_tree'))`;
        const levels = await loadLevels(tx);
        const at = levels.findIndex((l) => l.code === input.afterCode);
        if (at < 0) badRequest("Choose the level this one comes after.");
        if (
          levels.some((l) => l.code === code || l.label.toLowerCase() === input.label.toLowerCase())
        ) {
          badRequest("A level with that name already exists.");
        }
        const next = levels[at + 1];
        const order = next ? (levels[at].order + next.order) / 2 : levels[at].order + 10;
        const [created] = await tx<{ id: string }[]>`
          insert into public.org_levels (code, label, sort_order)
          values (${code}, ${input.label}, ${order}) returning id`;
        await writeAudit(tx, {
          eventType: "org_level.created",
          entityType: "org_level",
          entityId: created.id,
          userId: ctx.session.userId,
          newValue: { code, label: input.label, after: input.afterCode },
        });
        return { code };
      });
    }),

  renameLevel: orgManage
    .input(z.object({ code: levelCode, label: levelLabelSchema }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const [level] = await tx<{ id: string; label: string }[]>`
          select id, label from public.org_levels where code = ${input.code} for update`;
        if (!level) badRequest("Level not found.");
        if (
          (await loadLevels(tx)).some(
            (l) => l.code !== input.code && l.label.toLowerCase() === input.label.toLowerCase(),
          )
        ) {
          badRequest("Another level already has that name.");
        }
        await tx`update public.org_levels set label = ${input.label} where code = ${input.code}`;
        await writeAudit(tx, {
          eventType: "org_level.renamed",
          entityType: "org_level",
          entityId: level.id,
          userId: ctx.session.userId,
          oldValue: { label: level.label },
          newValue: { label: input.label },
        });
      });
    }),

  /** Only a level no org unit uses can go — including deactivated and removed units, whose history stays. */
  removeLevel: orgManage.input(z.object({ code: levelCode })).mutation(async ({ ctx, input }) => {
    await db().begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('org_units_tree'))`;
      const [level] = await tx<{ id: string; label: string; used: number }[]>`
        select l.id, l.label,
               (select count(*)::int from public.org_units o where o.unit_type = l.code) as used
        from public.org_levels l where l.code = ${input.code}`;
      if (!level) badRequest("Level not found.");
      if (input.code === ROOT_LEVEL) badRequest("The root level cannot be removed.");
      if (level.used > 0) {
        badRequest(
          `${level.used} org unit${level.used === 1 ? " is" : "s are"} at this level — it cannot be removed.`,
        );
      }
      await tx`delete from public.org_levels where code = ${input.code}`;
      await writeAudit(tx, {
        eventType: "org_level.removed",
        entityType: "org_level",
        entityId: level.id,
        userId: ctx.session.userId,
        oldValue: { code: input.code, label: level.label },
      });
    });
  }),

  tree: orgManage.query(async (): Promise<OrgUnitRow[]> => {
    const sql = db();
    const [nodes, counts] = await Promise.all([
      loadOrgNodes(sql),
      sql<{ org_unit_id: string; n: number }[]>`
        select org_unit_id, count(*)::int as n from public.user_org_assignments
        where revoked_at is null group by org_unit_id`,
    ]);
    const assigned = new Map(counts.map((c) => [c.org_unit_id, c.n]));
    return nodes.map((node) => ({ ...node, activeAssignments: assigned.get(node.id) ?? 0 }));
  }),

  impact: orgManage
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input }) => subtreeImpact(input.id, await loadOrgNodes(db()))),

  /**
   * A unit under a parent, or — with no parent — one more group: a separate organization with its own
   * tree, managed by the same Admins (owner's decision 2026-10-11, .grill/shared-org-units-decisions.md).
   */
  create: orgManage
    .input(
      z.object({
        parentId: z.uuid().nullable(),
        /** Further parents ticked on the form: the new unit also sits under each (migration 0044). */
        alsoUnder: z.array(z.uuid()).max(50).optional(),
        unitType: levelCode,
        name: nameSchema,
        code: codeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await db().begin(async (tx) => {
          const nodes = await loadTreeForUpdate(tx);
          const parent = input.parentId ? nodes.find((n) => n.id === input.parentId) : null;
          if (input.parentId && !parent) badRequest("Parent node not found.");
          if (parent) {
            if (isFrozen(parent.id, nodes)) {
              badRequest(
                "That node is inactive (or under an inactive node) — reactivate it first.",
              );
            }
            if (!canBeChildOf(await loadLevels(tx), parent.unitType, input.unitType)) {
              badRequest("That level can't be placed under the selected parent.");
            }
          } else {
            if (!ctx.session.isAdmin) badRequest("Only an Admin can add a group.");
            if (input.unitType !== ROOT_LEVEL) {
              badRequest("Only a group can stand on its own; every other level needs a parent.");
            }
          }
          // All the ticked parents or none: checked before anything is written.
          const extraIds = [...new Set(input.alsoUnder ?? [])].filter((id) => id !== parent?.id);
          if (extraIds.length > 0) {
            if (!parent) badRequest("A group has no parents.");
            const levels = await loadLevels(tx);
            const placed: OrgNode = {
              id: "new",
              parentId: parent.id,
              alsoUnder: [],
              unitType: input.unitType,
              status: "active",
            };
            for (const extraId of extraIds) {
              const check = checkAlsoUnder("new", extraId, [...nodes, placed], levels);
              const name = nodes.find((n) => n.id === extraId)?.name ?? "A chosen parent";
              if (!check.ok) badRequest(`${name}: ${check.reason}`);
              if (isFrozen(extraId, nodes)) badRequest(`${name} is inactive.`);
              placed.alsoUnder = [...(placed.alsoUnder ?? []), extraId];
            }
          }
          const [created] = await tx<{ id: string }[]>`
            insert into public.org_units (parent_id, unit_type, name, code)
            values (${parent?.id ?? null}, ${input.unitType}, ${input.name}, ${input.code})
            returning id`;
          for (const extraId of extraIds) {
            await tx`
              insert into public.org_unit_parents (org_unit_id, parent_id, created_by)
              values (${created.id}, ${extraId}, ${ctx.session.userId})`;
          }
          await writeAudit(tx, {
            eventType: "org_unit.created",
            entityType: "org_unit",
            entityId: created.id,
            userId: ctx.session.userId,
            newValue: {
              parent_id: parent?.id ?? null,
              also_under: extraIds,
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
        const check = checkMove(input.id, input.newParentId, nodes, await loadLevels(tx));
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

  /**
   * One more parent for a unit (migration 0044): a project two subsidiaries run sits under both. Its
   * figures count in full in each parent and once above them, and both parents' people see it. The main
   * parent — where it is moved and deactivated from — does not change.
   */
  addParent: orgManage
    .input(z.object({ id: z.uuid(), parentId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const nodes = await loadTreeForUpdate(tx);
        const check = checkAlsoUnder(input.id, input.parentId, nodes, await loadLevels(tx));
        if (!check.ok) badRequest(check.reason);
        if (isFrozen(input.parentId, nodes)) {
          badRequest("That parent is inactive (or under an inactive node).");
        }
        await tx`
          insert into public.org_unit_parents (org_unit_id, parent_id, created_by)
          values (${input.id}, ${input.parentId}, ${ctx.session.userId})`;
        await writeAudit(tx, {
          eventType: "org_unit.parent_added",
          entityType: "org_unit",
          entityId: input.id,
          userId: ctx.session.userId,
          newValue: { also_under: input.parentId },
        });
      });
      return null;
    }),

  removeParent: orgManage
    .input(z.object({ id: z.uuid(), parentId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext('org_units_tree'))`;
        const removed = await tx`
          delete from public.org_unit_parents
          where org_unit_id = ${input.id} and parent_id = ${input.parentId} returning org_unit_id`;
        if (removed.length === 0) badRequest("The node does not sit under that parent.");
        await writeAudit(tx, {
          eventType: "org_unit.parent_removed",
          entityType: "org_unit",
          entityId: input.id,
          userId: ctx.session.userId,
          oldValue: { also_under: input.parentId },
        });
      });
      return null;
    }),

  /**
   * The further parents of a unit, set in one go from the checklist on the Organization page: the ones no
   * longer ticked are removed, the newly ticked are added, all or nothing. The main parent is not part of it.
   */
  setParents: orgManage
    .input(z.object({ id: z.uuid(), alsoUnder: z.array(z.uuid()).max(50) }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const nodes = await loadTreeForUpdate(tx);
        const node = nodes.find((n) => n.id === input.id);
        if (!node) badRequest("Node not found.");
        const wanted = [...new Set(input.alsoUnder)];
        const removed = node.alsoUnder.filter((id) => !wanted.includes(id));
        const added = wanted.filter((id) => !node.alsoUnder.includes(id));
        if (removed.length + added.length === 0) return;
        const levels = await loadLevels(tx);
        // Checked against the unit as it will be once the removals are done.
        const after: OrgNode = {
          ...node,
          alsoUnder: node.alsoUnder.filter((id) => wanted.includes(id)),
        };
        for (const parentId of added) {
          const others = nodes.map((n) => (n.id === node.id ? after : n));
          const check = checkAlsoUnder(node.id, parentId, others, levels);
          const name = nodes.find((n) => n.id === parentId)?.name ?? "A chosen parent";
          if (!check.ok) badRequest(`${name}: ${check.reason}`);
          if (isFrozen(parentId, nodes)) badRequest(`${name} is inactive.`);
          after.alsoUnder = [...(after.alsoUnder ?? []), parentId];
        }
        if (removed.length > 0) {
          await tx`
            delete from public.org_unit_parents
            where org_unit_id = ${node.id} and parent_id = any(${removed}::uuid[])`;
        }
        for (const parentId of added) {
          await tx`
            insert into public.org_unit_parents (org_unit_id, parent_id, created_by)
            values (${node.id}, ${parentId}, ${ctx.session.userId})`;
        }
        await writeAudit(tx, {
          eventType: "org_unit.parents_changed",
          entityType: "org_unit",
          entityId: node.id,
          userId: ctx.session.userId,
          oldValue: { also_under: node.alsoUnder },
          newValue: { also_under: after.alsoUnder, added, removed },
        });
      });
      return null;
    }),

  /** Whether a unit can be deleted for good, and what stands in the way if not. */
  deleteCheck: orgManage
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input }): Promise<OrgDeleteCheck> => {
      const sql = db();
      const { units, blockers } = await deleteCheck(sql, input.id, await loadOrgNodes(sql));
      return { units, blockers };
    }),

  /** Deletes an unused unit and the units managed under it. The audit log keeps what they were. */
  delete: orgManage.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    try {
      await db().begin(async (tx) => {
        const nodes = await loadTreeForUpdate(tx);
        const check = await deleteCheck(tx, input.id, nodes);
        if (check.blockers.length) {
          badRequest(
            `This unit cannot be deleted. ${check.blockers.join(" ")} Deactivate it instead.`,
          );
        }
        const gone = nodes.filter((n) => check.ids.includes(n.id));
        await tx`delete from public.submission_expectations where org_unit_id = any(${check.ids}::uuid[])`;
        // One statement: the links between a parent and its children are checked when it ends.
        await tx`delete from public.org_units where id = any(${check.ids}::uuid[])`;
        for (const unit of gone) {
          await writeAudit(tx, {
            eventType: "org_unit.deleted",
            entityType: "org_unit",
            entityId: unit.id,
            userId: ctx.session.userId,
            oldValue: {
              parent_id: unit.parentId,
              also_under: unit.alsoUnder,
              unit_type: unit.unitType,
              name: unit.name,
              code: unit.code,
              deleted_with: unit.id === input.id ? null : input.id,
            },
          });
        }
      });
    } catch (error) {
      // Something else names the unit (a table added later): refuse rather than guess.
      if (pgErrorCode(error) === "23503") {
        badRequest(
          "This unit is still referred to by other data, so it cannot be deleted. Deactivate it instead.",
        );
      }
      throw error;
    }
    return null;
  }),

  setStatus: orgManage
    .input(z.object({ id: z.uuid(), status: z.enum(["active", "inactive"]) }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const nodes = await loadTreeForUpdate(tx);
        const node = nodes.find((n) => n.id === input.id);
        if (!node) badRequest("Node not found.");
        if (
          node.parentId === null &&
          input.status === "inactive" &&
          !nodes.some((n) => n.parentId === null && n.id !== node.id && n.status === "active")
        ) {
          badRequest("The only active group can't be deactivated.");
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
        {
          id: string;
          name: string;
          category_name: string;
          scope_name: string | null;
          frequency: string;
          expected: boolean;
          required_below: string[];
        }[]
      >`
        -- A Scope 3 activity sits under its category, whose parent is Scope 3: group by the scope itself
        -- and show the category beneath it.
        select m.id, m.name, case when ps.id is null then c.name else s.name end as category_name,
               coalesce(ps.name, s.name) as scope_name, m.frequency::text,
               exists (select 1 from public.submission_expectations e
                        where e.org_unit_id = ${input.orgUnitId} and e.metric_id = m.id) as expected,
               -- What the units below must submit is expected of this unit as well: the Control Tower
               -- already counts it here (org_unit_tree also follows a shared unit's other parents).
               coalesce((select array_agg(distinct o.name order by o.name)
                         from public.submission_expectations e
                         join public.org_unit_tree t on t.descendant_id = e.org_unit_id
                           and t.ancestor_id = ${input.orgUnitId} and t.descendant_id <> t.ancestor_id
                         join public.org_units o on o.id = e.org_unit_id and o.deleted_at is null
                         where e.metric_id = m.id), '{}') as required_below
        from public.esg_metrics m join public.esg_categories c on c.id = m.category_id
        left join public.scopes s on s.id = m.scope_id
        left join public.scopes ps on ps.id = s.parent_scope_id
        where m.deleted_at is null
        order by coalesce(ps.code, s.code) nulls last, 3, m.name`;
      return rows.map((r) => ({
        metricId: r.id,
        metricName: r.name,
        categoryName: r.category_name,
        scopeName: r.scope_name,
        frequency: r.frequency,
        expected: r.expected,
        requiredBelow: r.required_below,
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

  bulkImportOptions: orgBulkImport.query(async ({ ctx }) => {
    const nodes = await loadOrgNodes(db());
    const rows = nodes.map((n) => ({ ...n, parent_id: n.parentId, unit_type: n.unitType }));
    const reachable = new Set(
      ctx.session.isAdmin
        ? nodes.filter((n) => !isFrozen(n.id, nodes)).map((n) => n.id)
        : reachableNodeIds(
            nodes,
            ctx.session.assignments.map((a) => a.orgUnitId),
          ),
    );
    return rows
      .filter((r) => reachable.has(r.id))
      .map((r) => ({
        id: r.id,
        parentId: r.parent_id,
        name: r.name,
        code: r.code,
        unitType: r.unit_type as OrgNode["unitType"],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }),

  bulkImport: orgBulkImport
    .input(
      z.object({
        parentId: z.uuid(),
        rows: z
          .array(
            z.object({
              unitType: levelCode,
              name: nameSchema,
              code: codeSchema,
              /**
               * An existing org unit's code or another row's, or the name of an existing org unit that has
               * no code; empty = directly under `parentId`.
               */
              parentCode: z
                .string()
                .trim()
                .max(200)
                .transform((value) => value || null)
                .optional(),
              /** An existing org unit named by id (what an earlier template wrote). */
              parentId: z.uuid().optional(),
              /**
               * Other parents the unit also sits under (migration 0044), each named like `parentCode`:
               * a shared project lists its second subsidiary here.
               */
              alsoUnder: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
            }),
          )
          .min(1, "The sheet has no rows.")
          .max(500, "Import at most 500 rows at a time."),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ results: OrgBulkImportRowResult[] }> => {
      // Sheet row 1 is the header, so the first data row is row 2.
      const existing = await db()<{ id: string; code: string | null; name: string }[]>`
        select id, code, name from public.org_units where deleted_at is null`;
      const known = new Map(existing.flatMap((unit) => (unit.code ? [[unit.code, unit.id]] : [])));
      const sheetCodes = new Set(input.rows.map((row) => row.code));
      // A parent that is no code — of an existing unit or of a row — is the name of an existing unit that
      // has no code: the row is then tied to that unit. A name several units share stays unresolved.
      const shared = new Set<number>();
      // A shared unit listed once under each parent is one unit with all those parents.
      const { rows: merged, sameAs } = mergeSharedRows(input.rows);
      const rows = merged.map((row) => {
        const rowNum = row.index + 2;
        if (row.parentId || !row.parentCode) return { ...row, rowNum };
        if (known.has(row.parentCode) || sheetCodes.has(row.parentCode)) return { ...row, rowNum };
        const unit = unitByRef(existing, row.parentCode);
        if (unit === "ambiguous") shared.add(rowNum);
        return { ...row, rowNum, parentId: unit && unit !== "ambiguous" ? unit.id : undefined };
      });
      // One sheet can hold several levels: a row may name another row as its parent, so parents go first.
      // A code used by two rows makes "its parent" ambiguous, so neither row is created (nor, below, any
      // row that names that code): the person fixes the sheet rather than getting a tree they did not mean.
      const seen = new Map<string, number>();
      for (const row of rows) if (row.code) seen.set(row.code, (seen.get(row.code) ?? 0) + 1);
      const repeated = rows.filter((row) => row.code && seen.get(row.code)! > 1);
      const unique = rows.filter((row) => !repeated.includes(row));
      // A row that names its parent by id needs no ordering: that org unit exists already.
      // An "also under" that names another row of the sheet must wait for that row as well; one that names
      // an existing unit is looked up when the link is made.
      const { ordered, orphans } = importOrder(
        unique.map((row) => ({
          ...row,
          parentCode: row.parentId ? null : row.parentCode,
          alsoUnderCodes: (row.alsoUnder ?? []).filter((ref) => sheetCodes.has(ref)),
        })),
        new Set(known.keys()),
      );
      const results = new Map<number, OrgBulkImportRowResult>();
      for (const row of repeated) {
        results.set(row.rowNum, {
          row: row.rowNum,
          ok: false,
          name: row.name,
          error: `Code "${row.code}" is used by more than one row of this sheet.`,
        });
      }
      for (const row of ordered) {
        const parentId =
          row.parentId ?? (row.parentCode ? known.get(row.parentCode) : input.parentId);
        // Listed as creatable, but the row it names was refused: this one is not created either.
        // Each extra parent: another row's code (created by now, or refused), else an existing unit.
        const extra = (row.alsoUnder ?? []).map((ref) => {
          const unit = known.has(ref) || sheetCodes.has(ref) ? undefined : unitByRef(existing, ref);
          return {
            ref,
            id: known.get(ref) ?? (unit && unit !== "ambiguous" ? unit.id : undefined),
          };
        });
        const result = parentId
          ? await importOneOrgUnit(ctx.session, parentId, row, row.rowNum, extra)
          : {
              row: row.rowNum,
              ok: false as const,
              name: row.name,
              error: `Its parent "${row.parentCode}" was not created, so this row was not either.`,
            };
        results.set(row.rowNum, result);
        if (result.ok && row.code) known.set(row.code, result.id);
      }
      for (const row of orphans) {
        results.set(row.rowNum, {
          row: row.rowNum,
          ok: false,
          name: row.name,
          error: shared.has(row.rowNum)
            ? `More than one org unit is called "${row.parentCode}". Give them codes on the Organization page, then use the code.`
            : row.parentCode && !known.has(row.parentCode) && !row.parentId
              ? `Parent "${row.parentCode}" is neither an existing org unit nor another row of this sheet.`
              : `One of its "also under" units (${(row.alsoUnder ?? []).join(", ")}) was not created, so this row was not either.`,
        });
      }
      // One result per row of the sheet; a row that repeats a shared unit gets that unit's result.
      return {
        results: input.rows.map((_, index) => ({
          ...results.get((sameAs.get(index) ?? index) + 2)!,
          row: index + 2,
        })),
      };
    }),
});

type OrgBulkImportRow = {
  unitType: string;
  name: string;
  code: string | null;
};

export type OrgBulkImportRowResult =
  | { row: number; ok: true; id: string; name: string }
  | { row: number; ok: false; name: string; error: string };

/** One row of a bulk org-unit import, isolated so one bad row can't take down the rest of the batch. */
async function importOneOrgUnit(
  session: ActiveSession,
  parentId: string,
  row: OrgBulkImportRow,
  rowNum: number,
  /** Other parents to put the new unit under as well; `id` is missing when the name matched nothing. */
  alsoUnder: { ref: string; id?: string }[] = [],
): Promise<OrgBulkImportRowResult> {
  try {
    return await db().begin(async (tx) => {
      const nodes = await loadTreeForUpdate(tx);
      const parent = nodes.find((n) => n.id === parentId);
      if (!parent)
        return { row: rowNum, ok: false as const, name: row.name, error: "Parent node not found." };
      if (isFrozen(parent.id, nodes)) {
        return {
          row: rowNum,
          ok: false as const,
          name: row.name,
          error: "That node is inactive (or under an inactive node).",
        };
      }
      if (
        !session.isAdmin &&
        !reachableNodeIds(
          nodes,
          session.assignments.map((a) => a.orgUnitId),
        ).includes(parent.id)
      ) {
        return { row: rowNum, ok: false as const, name: row.name, error: "Outside your scope." };
      }
      const levels = await loadLevels(tx);
      if (!canBeChildOf(levels, parent.unitType, row.unitType)) {
        return {
          row: rowNum,
          ok: false as const,
          name: row.name,
          error: "That level can't be placed under the selected parent.",
        };
      }
      // All or nothing: a shared unit created under only one of its parents would be a tree nobody meant.
      const scope = session.isAdmin
        ? null
        : reachableNodeIds(
            nodes,
            session.assignments.map((a) => a.orgUnitId),
          );
      const placed: OrgNode = {
        id: "new",
        parentId: parent.id,
        alsoUnder: [],
        unitType: row.unitType,
        status: "active",
      };
      const extraIds: string[] = [];
      for (const extra of alsoUnder) {
        const refuse = (error: string) => ({
          row: rowNum,
          ok: false as const,
          name: row.name,
          error: `Also under "${extra.ref}": ${error}`,
        });
        if (!extra.id) return refuse("no org unit has that code or name.");
        if (scope && !scope.includes(extra.id)) return refuse("outside your scope.");
        if (isFrozen(extra.id, nodes)) return refuse("that unit is inactive.");
        const check = checkAlsoUnder("new", extra.id, [...nodes, placed], levels);
        if (!check.ok) return refuse(check.reason);
        placed.alsoUnder = [...(placed.alsoUnder ?? []), extra.id];
        extraIds.push(extra.id);
      }
      const [created] = await tx<{ id: string }[]>`
        insert into public.org_units (parent_id, unit_type, name, code)
        values (${parent.id}, ${row.unitType}, ${row.name}, ${row.code})
        returning id`;
      for (const extraId of extraIds) {
        await tx`
          insert into public.org_unit_parents (org_unit_id, parent_id, created_by)
          values (${created.id}, ${extraId}, ${session.userId})`;
      }
      await writeAudit(tx, {
        eventType: "org_unit.bulk_imported",
        entityType: "org_unit",
        entityId: created.id,
        userId: session.userId,
        newValue: {
          parent_id: parent.id,
          also_under: extraIds,
          unit_type: row.unitType,
          name: row.name,
          code: row.code,
        },
      });
      return { row: rowNum, ok: true as const, id: created.id, name: row.name };
    });
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      return {
        row: rowNum,
        ok: false,
        name: row.name,
        error: "That code is already used by another node.",
      };
    }
    throw error;
  }
}
