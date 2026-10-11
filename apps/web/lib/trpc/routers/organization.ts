import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { ActiveSession } from "@/lib/auth/session";
import { db, pgErrorCode, type Tx } from "@/lib/db";
import {
  canBeChildOf,
  checkMove,
  descendantIds,
  importOrder,
  isFrozen,
  reachableNodeIds,
  ROOT_LEVEL,
  unitByRef,
  type OrgLevel,
  type OrgNode,
} from "@/lib/org/rules";
import { loadLevels } from "@/lib/org/levels";
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

/** A configured level code; whether it exists and fits under the parent is checked against `org_levels`. */
const levelCode = z.string().trim().min(1).max(40);
const levelLabelSchema = z.string().trim().min(2, "Give the level a name.").max(60);

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
        unitType: levelCode,
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
          if (!canBeChildOf(await loadLevels(tx), parent.unitType, input.unitType)) {
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
        {
          id: string;
          name: string;
          category_name: string;
          scope_name: string | null;
          frequency: string;
          expected: boolean;
        }[]
      >`
        -- A Scope 3 activity sits under its category, whose parent is Scope 3: group by the scope itself
        -- and show the category beneath it.
        select m.id, m.name, case when ps.id is null then c.name else s.name end as category_name,
               coalesce(ps.name, s.name) as scope_name, m.frequency::text,
               exists (select 1 from public.submission_expectations e
                        where e.org_unit_id = ${input.orgUnitId} and e.metric_id = m.id) as expected
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
    const rows = await db()<
      {
        id: string;
        parent_id: string | null;
        unit_type: string;
        status: string;
        name: string;
        code: string | null;
      }[]
    >`
      select id, parent_id, unit_type, status, name, code from public.org_units
      where deleted_at is null`;
    const nodes: OrgNode[] = rows.map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      unitType: r.unit_type as OrgNode["unitType"],
      status: r.status as OrgNode["status"],
    }));
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
      const rows = input.rows.map((row, index) => {
        const rowNum = index + 2;
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
      const { ordered, orphans } = importOrder(
        unique.map((row) => (row.parentId ? { ...row, parentCode: null } : row)),
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
        const result = parentId
          ? await importOneOrgUnit(ctx.session, parentId, row, row.rowNum)
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
            : `Parent "${row.parentCode}" is neither an existing org unit nor another row of this sheet.`,
        });
      }
      return { results: rows.map((row) => results.get(row.rowNum)!) };
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
      if (!canBeChildOf(await loadLevels(tx), parent.unitType, row.unitType)) {
        return {
          row: rowNum,
          ok: false as const,
          name: row.name,
          error: "That level can't be placed under the selected parent.",
        };
      }
      const [created] = await tx<{ id: string }[]>`
        insert into public.org_units (parent_id, unit_type, name, code)
        values (${parent.id}, ${row.unitType}, ${row.name}, ${row.code})
        returning id`;
      await writeAudit(tx, {
        eventType: "org_unit.bulk_imported",
        entityType: "org_unit",
        entityId: created.id,
        userId: session.userId,
        newValue: { parent_id: parent.id, unit_type: row.unitType, name: row.name, code: row.code },
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
