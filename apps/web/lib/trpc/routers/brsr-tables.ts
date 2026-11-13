import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { BRSR_TABLES, cleanCells, tableOf, type Cells } from "@/lib/brsr-tables/definitions";
import { db } from "@/lib/db";
import { protectedProcedure, router } from "@/lib/trpc/init";
import { disclosureRights } from "@/lib/trpc/routers/brsr";

// SEBI's typed tables (owner's decision, 2026-11-13; migration 0087). Same rule as the written answers: a Super
// Admin writes every table; HR and Finance only the questions migration 0081 gives their permission.

const financialYear = z.number().int().min(2000).max(2100);

export type TypedTable = {
  code: string;
  indicatorId: string;
  questionText: string;
  cells: Cells;
  notes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  canEdit: boolean;
};

const TABLE_INPUT = z.object({
  code: z.string().max(20),
  cells: z.record(z.string().max(80), z.record(z.string().max(40), z.unknown())),
  notes: z.string().trim().max(2000).nullable(),
});

export const brsrTablesRouter = router({
  /** Every typed table for one financial year, with what was saved and whether the caller may change it. */
  list: protectedProcedure
    .input(z.object({ financialYear }))
    .query(async ({ ctx, input }): Promise<TypedTable[]> => {
      const sql = db();
      const rights = await disclosureRights(sql, ctx.session);
      const rows = await sql<
        {
          id: string;
          code: string;
          question_text: string;
          owning_permission: string | null;
          cells: Cells | null;
          notes: string | null;
          updated_at: Date | null;
          updated_by: string | null;
        }[]
      >`
        select i.id, i.code, i.question_text, i.owning_permission, a.cells, a.notes, a.updated_at,
               u.display_name as updated_by
        from public.brsr_indicators i
        left join public.brsr_table_answers a
          on a.brsr_indicator_id = i.id and a.financial_year = ${input.financialYear}
        left join public.users u on u.id = a.updated_by
        where i.deleted_at is null and i.code in ${sql(BRSR_TABLES.map((t) => t.code))}`;
      return BRSR_TABLES.flatMap((def) => {
        const row = rows.find((x) => x.code === def.code);
        if (!row) return [];
        const canEdit =
          rights === null || (!!row.owning_permission && rights.includes(row.owning_permission));
        // HR and Finance see only the tables that are theirs; a Super Admin sees them all.
        if (!canEdit) return [];
        return [
          {
            code: def.code,
            indicatorId: row.id,
            questionText: row.question_text,
            cells: row.cells ?? {},
            notes: row.notes,
            updatedAt: row.updated_at?.toISOString() ?? null,
            updatedBy: row.updated_by,
            canEdit,
          },
        ];
      });
    }),

  /** Save one or more tables for a year (the editor saves one; an Excel import saves every sheet at once). */
  save: protectedProcedure
    .input(z.object({ financialYear, tables: z.array(TABLE_INPUT).min(1).max(BRSR_TABLES.length) }))
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      const rights = await disclosureRights(sql, ctx.session);
      const cleaned: { code: string; cells: Cells; notes: string | null }[] = [];
      for (const table of input.tables) {
        const def = tableOf(table.code);
        if (!def)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${table.code} is not a typed table.`,
          });
        const result = cleanCells(def, table.cells as Record<string, Record<string, unknown>>);
        if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: result.reason });
        cleaned.push({ code: def.code, cells: result.cells, notes: table.notes || null });
      }
      return sql.begin(async (tx) => {
        let saved = 0;
        for (const table of cleaned) {
          const [indicator] = await tx<{ id: string; owning_permission: string | null }[]>`
            select id, owning_permission from public.brsr_indicators
            where code = ${table.code} and deleted_at is null`;
          if (!indicator) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `${table.code} isn't in the BRSR format.`,
            });
          }
          if (
            rights !== null &&
            !(indicator.owning_permission && rights.includes(indicator.owning_permission))
          ) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `${table.code} isn't yours to change.`,
            });
          }
          const [before] = await tx<{ cells: Cells; notes: string | null }[]>`
            select cells, notes from public.brsr_table_answers
            where brsr_indicator_id = ${indicator.id} and financial_year = ${input.financialYear}
            for update`;
          const empty = Object.keys(table.cells).length === 0 && !table.notes;
          if (
            JSON.stringify(before?.cells ?? {}) === JSON.stringify(table.cells) &&
            (before?.notes ?? null) === table.notes
          ) {
            continue;
          }
          if (empty) {
            await tx`
              delete from public.brsr_table_answers
              where brsr_indicator_id = ${indicator.id} and financial_year = ${input.financialYear}`;
          } else {
            await tx`
              insert into public.brsr_table_answers
                (brsr_indicator_id, financial_year, cells, notes, updated_by)
              values (${indicator.id}, ${input.financialYear}, ${tx.json(table.cells)}, ${table.notes},
                      ${ctx.session.userId})
              on conflict (brsr_indicator_id, financial_year) do update
                set cells = excluded.cells, notes = excluded.notes, updated_by = excluded.updated_by,
                    updated_at = now()`;
          }
          await writeAudit(tx, {
            eventType: "brsr.table_saved",
            entityType: "brsr_indicator",
            entityId: indicator.id,
            userId: ctx.session.userId,
            oldValue: before
              ? { code: table.code, financial_year: input.financialYear, ...before }
              : null,
            newValue: {
              code: table.code,
              financial_year: input.financialYear,
              cells: table.cells,
              notes: table.notes,
            },
          });
          saved += 1;
        }
        return { saved };
      });
    }),
});
