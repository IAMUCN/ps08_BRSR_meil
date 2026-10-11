import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { assertOrgScope, inOrgScope as inScope, scopedOrgUnitIds } from "@/lib/auth/scope";
import { registryEnum, creditStatusEnum, targetScopeEnum } from "@/lib/carbon-credits/engine";
import { db } from "@/lib/db";
import { permissionProcedure, router } from "@/lib/trpc/init";

const view = permissionProcedure("carbon_credit.view");
const manage = permissionProcedure("carbon_credit.manage");
const icpManage = permissionProcedure("icp.manage");

// These procedures read and write through lib/db.ts, which bypasses RLS, and the three permissions are held
// below the group (a Project Manager holds carbon_credit.view): every one stays inside the caller's org scope.

export { registryEnum, creditStatusEnum, targetScopeEnum };

export type CarbonCreditSummary = {
  totalMintedTco2e: number;
  availableTco2e: number;
  retiredTco2e: number;
  transferredTco2e: number;
  activeBatchesCount: number;
  currentShadowPrice: number;
  currency: string;
  registryBreakdown: { registry: string; quantityTco2e: number }[];
  statusBreakdown: { status: string; quantityTco2e: number }[];
};

export const carbonCreditsRouter = router({
  /**
   * Helper options for UI selectors (org units and active reporting periods).
   */
  options: view.query(async ({ ctx }) => {
    const sql = db();
    const scope = await scopedOrgUnitIds(sql, ctx.session);

    const [orgUnits, periods] = await Promise.all([
      sql<{ id: string; name: string; code: string; unit_type: string }[]>`
        select id, name, code, unit_type
        from public.org_units
        where deleted_at is null and (${scope}::uuid[] is null or id = any(${scope}::uuid[]))
        order by name asc
      `,
      sql<
        { id: string; label: string; period_start: string; period_end: string; status: string }[]
      >`
        select id, label, start_date::text as period_start, end_date::text as period_end, status
        from public.reporting_periods
        order by start_date desc
      `,
    ]);

    return {
      orgUnits: orgUnits.map((u) => ({
        id: u.id,
        name: u.name,
        code: u.code,
        unitType: u.unit_type,
      })),
      periods: periods.map((p) => ({
        id: p.id,
        label: p.label,
        periodStart: p.period_start,
        periodEnd: p.period_end,
        status: p.status,
      })),
    };
  }),

  /**
   * Summary KPI metrics for the Carbon Credit Registry Ledger.
   */
  summary: view
    .input(
      z
        .object({
          orgUnitId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }): Promise<CarbonCreditSummary> => {
      const sql = db();
      const scope = await scopedOrgUnitIds(sql, ctx.session);

      const [creditsAgg, transactionsAgg, icpPrice, byRegistry, byStatus] = await Promise.all([
        sql<
          {
            total_minted: string | null;
            available: string | null;
            batch_count: string;
          }[]
        >`
          select
            coalesce(sum(quantity_tco2e), 0)::text as total_minted,
            coalesce(sum(case when status in ('MINTED', 'HELD') then quantity_tco2e else 0 end), 0)::text as available,
            count(*)::text as batch_count
          from public.carbon_credits
          where (${input?.orgUnitId ?? null}::uuid is null or org_unit_id = ${input?.orgUnitId ?? null}::uuid)
            and (${scope}::uuid[] is null or org_unit_id = any(${scope}::uuid[]))
        `,
        sql<
          {
            total_retired: string | null;
            total_transferred: string | null;
          }[]
        >`
          select
            coalesce(sum(case when tx.transaction_type = 'RETIREMENT' then tx.quantity_tco2e else 0 end), 0)::text as total_retired,
            coalesce(sum(case when tx.transaction_type = 'TRANSFER' then tx.quantity_tco2e else 0 end), 0)::text as total_transferred
          from public.carbon_credit_transactions tx
          join public.carbon_credits c on c.id = tx.credit_id
          where (${input?.orgUnitId ?? null}::uuid is null or tx.beneficiary_org_unit_id = ${input?.orgUnitId ?? null}::uuid)
            and (${scope}::uuid[] is null or c.org_unit_id = any(${scope}::uuid[]))
        `,
        sql<
          {
            shadow_price_per_tco2e: string;
            currency: string;
          }[]
        >`
          select shadow_price_per_tco2e::text, currency
          from public.internal_carbon_prices
          where is_active = true
            and (${input?.orgUnitId ?? null}::uuid is null or org_unit_id = ${input?.orgUnitId ?? null}::uuid)
            and (${scope}::uuid[] is null or org_unit_id = any(${scope}::uuid[]))
          order by effective_from desc
          limit 1
        `,
        sql<{ registry: string; total: string }[]>`
          select registry::text, coalesce(sum(quantity_tco2e), 0)::text as total
          from public.carbon_credits
          where (${input?.orgUnitId ?? null}::uuid is null or org_unit_id = ${input?.orgUnitId ?? null}::uuid)
            and (${scope}::uuid[] is null or org_unit_id = any(${scope}::uuid[]))
          group by registry
        `,
        sql<{ status: string; total: string }[]>`
          select status::text, coalesce(sum(quantity_tco2e), 0)::text as total
          from public.carbon_credits
          where (${input?.orgUnitId ?? null}::uuid is null or org_unit_id = ${input?.orgUnitId ?? null}::uuid)
            and (${scope}::uuid[] is null or org_unit_id = any(${scope}::uuid[]))
          group by status
        `,
      ]);

      const defaultPrice = 2500;
      const defaultCurrency = "INR";

      return {
        totalMintedTco2e: Number(creditsAgg[0]?.total_minted ?? 0),
        availableTco2e: Number(creditsAgg[0]?.available ?? 0),
        retiredTco2e: Number(transactionsAgg[0]?.total_retired ?? 0),
        transferredTco2e: Number(transactionsAgg[0]?.total_transferred ?? 0),
        activeBatchesCount: Number(creditsAgg[0]?.batch_count ?? 0),
        currentShadowPrice: icpPrice[0] ? Number(icpPrice[0].shadow_price_per_tco2e) : defaultPrice,
        currency: icpPrice[0]?.currency ?? defaultCurrency,
        registryBreakdown: byRegistry.map((r) => ({
          registry: r.registry,
          quantityTco2e: Number(r.total),
        })),
        statusBreakdown: byStatus.map((s) => ({
          status: s.status,
          quantityTco2e: Number(s.total),
        })),
      };
    }),

  /**
   * List all carbon credit batches in inventory.
   */
  list: view
    .input(
      z
        .object({
          orgUnitId: z.string().uuid().optional(),
          status: creditStatusEnum.optional(),
          registry: registryEnum.optional(),
          vintageYear: z.number().int().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const sql = db();
      const scope = await scopedOrgUnitIds(sql, ctx.session);

      const rows = await sql<
        {
          id: string;
          org_unit_id: string;
          org_unit_name: string;
          project_name: string;
          registry: string;
          registry_project_id: string;
          serial_number_start: string;
          serial_number_end: string;
          quantity_tco2e: string;
          vintage_year: number;
          methodology_code: string;
          credit_type: string;
          status: string;
          issuance_date: string;
          verifier_name: string;
          evidence_document_id: string | null;
          evidence_file_name: string | null;
          notes: string | null;
          retired_amount: string | null;
          transferred_amount: string | null;
          created_at: string;
        }[]
      >`
        select
          c.id,
          c.org_unit_id,
          ou.name as org_unit_name,
          c.project_name,
          c.registry::text,
          c.registry_project_id,
          c.serial_number_start,
          c.serial_number_end,
          c.quantity_tco2e::text,
          c.vintage_year,
          c.methodology_code,
          c.credit_type,
          c.status::text,
          c.issuance_date::text,
          c.verifier_name,
          c.evidence_document_id,
          d.file_name as evidence_file_name,
          c.notes,
          coalesce(sum(case when tx.transaction_type = 'RETIREMENT' then tx.quantity_tco2e else 0 end), 0)::text as retired_amount,
          coalesce(sum(case when tx.transaction_type = 'TRANSFER' then tx.quantity_tco2e else 0 end), 0)::text as transferred_amount,
          c.created_at::text
        from public.carbon_credits c
        join public.org_units ou on ou.id = c.org_unit_id
        left join public.documents d on d.id = c.evidence_document_id
        left join public.carbon_credit_transactions tx on tx.credit_id = c.id
        where (${input?.orgUnitId ?? null}::uuid is null or c.org_unit_id = ${input?.orgUnitId ?? null}::uuid)
          and (${scope}::uuid[] is null or c.org_unit_id = any(${scope}::uuid[]))
          and (${input?.status ?? null}::text is null or c.status::text = ${input?.status ?? null}::text)
          and (${input?.registry ?? null}::text is null or c.registry::text = ${input?.registry ?? null}::text)
          and (${input?.vintageYear ?? null}::int is null or c.vintage_year = ${input?.vintageYear ?? null}::int)
        group by c.id, ou.name, d.file_name
        order by c.created_at desc
      `;

      return rows.map((r) => {
        const total = Number(r.quantity_tco2e);
        const retired = Number(r.retired_amount ?? 0);
        const transferred = Number(r.transferred_amount ?? 0);
        const remaining = Math.max(0, total - retired - transferred);

        return {
          id: r.id,
          orgUnitId: r.org_unit_id,
          orgUnitName: r.org_unit_name,
          projectName: r.project_name,
          registry: r.registry,
          registryProjectId: r.registry_project_id,
          serialNumberStart: r.serial_number_start,
          serialNumberEnd: r.serial_number_end,
          quantityTco2e: total,
          retiredTco2e: retired,
          transferredTco2e: transferred,
          remainingTco2e: remaining,
          vintageYear: r.vintage_year,
          methodologyCode: r.methodology_code,
          creditType: r.credit_type,
          status: r.status,
          issuanceDate: r.issuance_date,
          verifierName: r.verifier_name,
          evidenceDocumentId: r.evidence_document_id,
          evidenceFileName: r.evidence_file_name,
          notes: r.notes,
          createdAt: r.created_at,
        };
      });
    }),

  /**
   * Mint / register a new verified carbon credit batch.
   */
  mint: manage
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        projectName: z.string().trim().min(3).max(200),
        registry: registryEnum,
        registryProjectId: z.string().trim().min(2).max(100),
        serialNumberStart: z.string().trim().min(3).max(120),
        serialNumberEnd: z.string().trim().min(3).max(120),
        quantityTco2e: z.number().positive(),
        vintageYear: z.number().int().min(2015).max(2050),
        methodologyCode: z.string().trim().min(2).max(100),
        creditType: z.string().trim().default("AVOIDANCE"),
        issuanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        verifierName: z.string().trim().min(2).max(150),
        evidenceDocumentId: z.string().uuid().optional(),
        notes: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      await assertOrgScope(sql, ctx.session, input.orgUnitId);

      return await sql.begin(async (tx) => {
        const [inserted] = await tx<{ id: string }[]>`
          insert into public.carbon_credits (
            org_unit_id, project_name, registry, registry_project_id,
            serial_number_start, serial_number_end, quantity_tco2e, vintage_year,
            methodology_code, credit_type, status, issuance_date, verifier_name,
            evidence_document_id, notes
          ) values (
            ${input.orgUnitId}, ${input.projectName}, ${input.registry}, ${input.registryProjectId},
            ${input.serialNumberStart}, ${input.serialNumberEnd}, ${input.quantityTco2e}, ${input.vintageYear},
            ${input.methodologyCode}, ${input.creditType}, 'MINTED', ${input.issuanceDate}::date, ${input.verifierName},
            ${input.evidenceDocumentId ?? null}, ${input.notes ?? null}
          )
          returning id
        `;

        await writeAudit(tx, {
          eventType: "carbon_credit.minted",
          entityType: "carbon_credits",
          entityId: inserted.id,
          userId: ctx.session.userId,
          newValue: {
            registry: input.registry,
            quantityTco2e: input.quantityTco2e,
            vintageYear: input.vintageYear,
            projectName: input.projectName,
            serialBlock: `${input.serialNumberStart} - ${input.serialNumberEnd}`,
          },
          reason: "Verified credit batch registered in portal inventory",
        });

        return { id: inserted.id, success: true };
      });
    }),

  /**
   * Retire credits to offset emissions for an organization unit & reporting period.
   * Enforces Anti-Double-Counting Guard Rails.
   */
  retire: manage
    .input(
      z.object({
        creditId: z.string().uuid(),
        quantityTco2e: z.number().positive(),
        reportingPeriodId: z.string().uuid(),
        beneficiaryOrgUnitId: z.string().uuid(),
        targetScope: targetScopeEnum,
        retirementReason: z.string().trim().min(5).max(500),
        evidenceDocumentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();

      return await sql.begin(async (tx) => {
        // 1. Fetch current credit batch
        const [credit] = await tx<
          {
            id: string;
            quantity_tco2e: string;
            status: string;
            vintage_year: number;
            org_unit_id: string;
          }[]
        >`
          select id, quantity_tco2e::text, status::text, vintage_year, org_unit_id
          from public.carbon_credits
          where id = ${input.creditId}
          for update
        `;

        // A batch outside the caller's scope reads as missing.
        if (!credit || !(await inScope(tx, ctx.session, credit.org_unit_id))) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Carbon credit batch not found." });
        }
        await assertOrgScope(tx, ctx.session, input.beneficiaryOrgUnitId);

        // Guard: Transferred credits can NEVER be retired for internal claims
        if (credit.status === "TRANSFERRED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Double-counting violation: This credit batch was transferred to a third party and is permanently barred from internal emission offset claims.",
          });
        }

        // 2. Calculate remaining available balance
        const [usedAgg] = await tx<{ used: string }[]>`
          select coalesce(sum(quantity_tco2e), 0)::text as used
          from public.carbon_credit_transactions
          where credit_id = ${input.creditId}
        `;

        const totalBatch = Number(credit.quantity_tco2e);
        const previouslyUsed = Number(usedAgg.used);
        const available = totalBatch - previouslyUsed;

        if (input.quantityTco2e > available + 0.0001) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot retire ${input.quantityTco2e} tCO2e. Only ${available.toFixed(2)} tCO2e available in this batch.`,
          });
        }

        // 3. Record transaction in append-only table
        const [insertedTx] = await tx<{ id: string }[]>`
          insert into public.carbon_credit_transactions (
            credit_id, transaction_type, quantity_tco2e, reporting_period_id,
            beneficiary_org_unit_id, retirement_reason, target_scope,
            evidence_document_id, executed_by
          ) values (
            ${input.creditId}, 'RETIREMENT', ${input.quantityTco2e}, ${input.reportingPeriodId},
            ${input.beneficiaryOrgUnitId}, ${input.retirementReason}, ${input.targetScope},
            ${input.evidenceDocumentId ?? null}, ${ctx.session.userId}
          )
          returning id
        `;

        // 4. Update status on parent batch if fully retired
        if (previouslyUsed + input.quantityTco2e >= totalBatch - 0.0001) {
          await tx`
            update public.carbon_credits
            set status = 'RETIRED', updated_at = now()
            where id = ${input.creditId}
          `;
        }

        // 5. Audit log
        await writeAudit(tx, {
          eventType: "carbon_credit.retired",
          entityType: "carbon_credit_transactions",
          entityId: insertedTx.id,
          userId: ctx.session.userId,
          newValue: {
            creditId: input.creditId,
            quantityTco2e: input.quantityTco2e,
            targetScope: input.targetScope,
            beneficiaryOrgUnitId: input.beneficiaryOrgUnitId,
            reportingPeriodId: input.reportingPeriodId,
          },
          reason: input.retirementReason,
        });

        return { transactionId: insertedTx.id, success: true };
      });
    }),

  /**
   * Log an external transfer / sale of carbon credits to a third party.
   * Permanently excludes these serial numbers from internal BRSR decarbonization claims.
   */
  transfer: manage
    .input(
      z.object({
        creditId: z.string().uuid(),
        quantityTco2e: z.number().positive(),
        counterpartyName: z.string().trim().min(3).max(200),
        counterpartyRegistryAccount: z.string().trim().min(3).max(100),
        evidenceDocumentId: z.string().uuid().optional(),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();

      return await sql.begin(async (tx) => {
        const [credit] = await tx<
          {
            id: string;
            quantity_tco2e: string;
            status: string;
            org_unit_id: string;
          }[]
        >`
          select id, quantity_tco2e::text, status::text, org_unit_id
          from public.carbon_credits
          where id = ${input.creditId}
          for update
        `;

        if (!credit || !(await inScope(tx, ctx.session, credit.org_unit_id))) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Carbon credit batch not found." });
        }

        const [usedAgg] = await tx<{ used: string }[]>`
          select coalesce(sum(quantity_tco2e), 0)::text as used
          from public.carbon_credit_transactions
          where credit_id = ${input.creditId}
        `;

        const totalBatch = Number(credit.quantity_tco2e);
        const previouslyUsed = Number(usedAgg.used);
        const available = totalBatch - previouslyUsed;

        if (input.quantityTco2e > available + 0.0001) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot transfer ${input.quantityTco2e} tCO2e. Only ${available.toFixed(2)} tCO2e available.`,
          });
        }

        const [insertedTx] = await tx<{ id: string }[]>`
          insert into public.carbon_credit_transactions (
            credit_id, transaction_type, quantity_tco2e, counterparty_name,
            counterparty_registry_account, retirement_reason,
            evidence_document_id, executed_by
          ) values (
            ${input.creditId}, 'TRANSFER', ${input.quantityTco2e}, ${input.counterpartyName},
            ${input.counterpartyRegistryAccount}, ${input.notes ?? "Sold to external buyer"},
            ${input.evidenceDocumentId ?? null}, ${ctx.session.userId}
          )
          returning id
        `;

        if (previouslyUsed + input.quantityTco2e >= totalBatch - 0.0001) {
          await tx`
            update public.carbon_credits
            set status = 'TRANSFERRED', updated_at = now()
            where id = ${input.creditId}
          `;
        }

        await writeAudit(tx, {
          eventType: "carbon_credit.transferred",
          entityType: "carbon_credit_transactions",
          entityId: insertedTx.id,
          userId: ctx.session.userId,
          newValue: {
            creditId: input.creditId,
            quantityTco2e: input.quantityTco2e,
            counterpartyName: input.counterpartyName,
            counterpartyRegistryAccount: input.counterpartyRegistryAccount,
          },
          reason: "External sale logged. Credits excluded from internal BRSR claims.",
        });

        return { transactionId: insertedTx.id, success: true };
      });
    }),

  /**
   * Double-Counting Prevention Reconciliation:
   * Reconciles Gross Emissions, Retired Offsets, and Transferred Exclusions
   * to compute the net carbon position for SEBI BRSR and stakeholder assurance.
   */
  reconciliation: view
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = db();
      await assertOrgScope(sql, ctx.session, input.orgUnitId);

      // 1. Fetch Gross Scope 1, 2, 3 emissions from approved records
      const grossEmissions = await sql<
        {
          scope_code: string;
          total_tco2e: string;
        }[]
      >`
        select
          s.code as scope_code,
          coalesce(sum(case
            when cr.value_unit in ('tCO2e', 'tonnes CO2e') then cr.value
            when cr.value_unit in ('kgCO2e', 'kg CO2e') then cr.value / 1000.0
            else 0
          end), 0)::text as total_tco2e
        from public.consolidation_records cr
        join public.scopes s on s.id = cr.scope_id
        where cr.org_unit_id = ${input.orgUnitId}
          and cr.approval_status = 'approved'
          and (${input.reportingPeriodId ?? null}::uuid is null or cr.reporting_period_id = ${input.reportingPeriodId ?? null}::uuid)
        group by s.code
      `;

      let grossScope1 = 0;
      let grossScope2 = 0;
      let grossScope3 = 0;

      for (const row of grossEmissions) {
        const val = Number(row.total_tco2e);
        if (row.scope_code === "SCOPE_1") grossScope1 += val;
        else if (row.scope_code === "SCOPE_2") grossScope2 += val;
        else if (row.scope_code === "SCOPE_3") grossScope3 += val;
      }
      const grossTotal = grossScope1 + grossScope2 + grossScope3;

      // 2. Fetch Retired Offsets claimed for this org unit and period
      const retiredOffsets = await sql<
        {
          target_scope: string;
          offset_tco2e: string;
        }[]
      >`
        select
          coalesce(target_scope, 'SCOPE_1') as target_scope,
          coalesce(sum(quantity_tco2e), 0)::text as offset_tco2e
        from public.carbon_credit_transactions
        where transaction_type = 'RETIREMENT'
          and beneficiary_org_unit_id = ${input.orgUnitId}
          and (${input.reportingPeriodId ?? null}::uuid is null or reporting_period_id = ${input.reportingPeriodId ?? null}::uuid)
        group by target_scope
      `;

      let offsetScope1 = 0;
      let offsetScope2 = 0;
      let offsetScope3 = 0;

      for (const row of retiredOffsets) {
        const val = Number(row.offset_tco2e);
        if (row.target_scope === "SCOPE_1") offsetScope1 += val;
        else if (row.target_scope === "SCOPE_2") offsetScope2 += val;
        else if (row.target_scope === "SCOPE_3") offsetScope3 += val;
      }
      const totalOffsets = offsetScope1 + offsetScope2 + offsetScope3;

      // 3. Fetch Transferred/Sold credits originating from this entity (Excluded from claims)
      const [transferredData] = await sql<
        {
          count: string;
          total_transferred: string;
        }[]
      >`
        select
          count(*)::text as count,
          coalesce(sum(tx.quantity_tco2e), 0)::text as total_transferred
        from public.carbon_credit_transactions tx
        join public.carbon_credits c on c.id = tx.credit_id
        where tx.transaction_type = 'TRANSFER'
          and c.org_unit_id = ${input.orgUnitId}
      `;

      // 4. The check itself: no batch held by this org unit may have more retired and transferred than it
      // holds. Computed from the ledger on every call — never a fixed answer.
      const [overdrawn] = await sql<{ n: number }[]>`
        select count(*)::int as n from (
          select c.id
          from public.carbon_credits c
          join public.carbon_credit_transactions tx on tx.credit_id = c.id
          where c.org_unit_id = ${input.orgUnitId}
          group by c.id, c.quantity_tco2e
          having sum(tx.quantity_tco2e) > c.quantity_tco2e + 0.0001
        ) over_allocated`;
      const overdrawnBatches = overdrawn?.n ?? 0;

      // 5. Net positions
      const netScope1 = Math.max(0, grossScope1 - offsetScope1);
      const netScope2 = Math.max(0, grossScope2 - offsetScope2);
      const netScope3 = Math.max(0, grossScope3 - offsetScope3);
      const netTotal = Math.max(0, grossTotal - totalOffsets);

      return {
        gross: {
          scope1: grossScope1,
          scope2: grossScope2,
          scope3: grossScope3,
          total: grossTotal,
        },
        offsets: {
          scope1: offsetScope1,
          scope2: offsetScope2,
          scope3: offsetScope3,
          total: totalOffsets,
        },
        net: {
          scope1: netScope1,
          scope2: netScope2,
          scope3: netScope3,
          total: netTotal,
        },
        transferredExclusions: {
          batchesCount: Number(transferredData?.count ?? 0),
          quantityTco2e: Number(transferredData?.total_transferred ?? 0),
          status: "PERMANENTLY_EXCLUDED",
        },
        doubleCountingIntegrityCheck: {
          passed: overdrawnBatches === 0,
          claimDisclosuresValid: overdrawnBatches === 0,
          message:
            overdrawnBatches === 0
              ? "Ledger check passed: no batch held by this org unit has more retired and transferred than it holds, and transferred credits are not counted in the net figures."
              : `Ledger check failed: ${overdrawnBatches} batch(es) held by this org unit have more retired and transferred than they hold. Review the ledger before using the net figures.`,
        },
      };
    }),

  /**
   * Internal Carbon Pricing (ICP) procedures:
   * View shadow prices and evaluate capital investment projects.
   */
  icpList: view
    .input(
      z
        .object({
          orgUnitId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const sql = db();
      const scope = await scopedOrgUnitIds(sql, ctx.session);

      const rows = await sql<
        {
          id: string;
          org_unit_id: string;
          org_unit_name: string;
          effective_from: string;
          effective_to: string | null;
          shadow_price_per_tco2e: string;
          currency: string;
          price_type: string;
          applies_to_scopes: string[];
          source_rational: string;
          is_active: boolean;
        }[]
      >`
        select
          p.id,
          p.org_unit_id,
          ou.name as org_unit_name,
          p.effective_from::text,
          p.effective_to::text,
          p.shadow_price_per_tco2e::text,
          p.currency,
          p.price_type::text,
          p.applies_to_scopes,
          p.source_rational,
          p.is_active
        from public.internal_carbon_prices p
        join public.org_units ou on ou.id = p.org_unit_id
        where (${input?.orgUnitId ?? null}::uuid is null or p.org_unit_id = ${input?.orgUnitId ?? null}::uuid)
          and (${scope}::uuid[] is null or p.org_unit_id = any(${scope}::uuid[]))
        order by p.effective_from desc
      `;

      return rows.map((r) => ({
        id: r.id,
        orgUnitId: r.org_unit_id,
        orgUnitName: r.org_unit_name,
        effectiveFrom: r.effective_from,
        effectiveTo: r.effective_to,
        shadowPricePerTco2e: Number(r.shadow_price_per_tco2e),
        currency: r.currency,
        priceType: r.price_type,
        appliesToScopes: r.applies_to_scopes,
        sourceRational: r.source_rational,
        isActive: r.is_active,
      }));
    }),

  icpCreate: icpManage
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        shadowPricePerTco2e: z.number().positive(),
        currency: z.string().length(3).default("INR"),
        priceType: z
          .enum(["SHADOW_PRICE", "INTERNAL_FEE", "IMPLICIT_PRICE"])
          .default("SHADOW_PRICE"),
        appliesToScopes: z.array(z.string()).default(["SCOPE_1", "SCOPE_2"]),
        sourceRational: z.string().trim().min(5).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      await assertOrgScope(sql, ctx.session, input.orgUnitId);

      return await sql.begin(async (tx) => {
        // Deactivate previous price for this unit
        await tx`
          update public.internal_carbon_prices
          set is_active = false
          where org_unit_id = ${input.orgUnitId} and is_active = true
        `;

        const [inserted] = await tx<{ id: string }[]>`
          insert into public.internal_carbon_prices (
            org_unit_id, effective_from, shadow_price_per_tco2e, currency,
            price_type, applies_to_scopes, source_rational, is_active
          ) values (
            ${input.orgUnitId}, ${input.effectiveFrom}::date, ${input.shadowPricePerTco2e},
            ${input.currency}, ${input.priceType}, ${input.appliesToScopes},
            ${input.sourceRational}, true
          )
          returning id
        `;

        await writeAudit(tx, {
          eventType: "icp.configured",
          entityType: "internal_carbon_prices",
          entityId: inserted.id,
          userId: ctx.session.userId,
          newValue: {
            shadowPrice: input.shadowPricePerTco2e,
            currency: input.currency,
            orgUnitId: input.orgUnitId,
          },
          reason: input.sourceRational,
        });

        return { id: inserted.id, success: true };
      });
    }),

  /**
   * CapEx Carbon Evaluation:
   * Models the financial and carbon-adjusted payback period / NPV for a proposed capital investment.
   */
  evaluateCapex: icpManage
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        projectName: z.string().trim().min(3).max(200),
        baselineAnnualEmissionsTco2e: z.number().positive(),
        projectedAnnualEmissionsTco2e: z.number().min(0),
        capexAmount: z.number().positive(),
        operationalAnnualSavings: z.number().min(0),
        projectLifespanYears: z.number().int().min(1).max(50),
        discountRatePercent: z.number().min(0).max(50).default(8.0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      await assertOrgScope(sql, ctx.session, input.orgUnitId);

      // 1. Get active shadow price
      const [icp] = await sql<
        {
          id: string;
          shadow_price_per_tco2e: string;
          currency: string;
        }[]
      >`
        select id, shadow_price_per_tco2e::text, currency
        from public.internal_carbon_prices
        where is_active = true
          and org_unit_id = ${input.orgUnitId}
        order by effective_from desc
        limit 1
      `;

      const shadowPriceId = icp?.id;
      const shadowPricePerTco2e = icp ? Number(icp.shadow_price_per_tco2e) : 2500;
      const currency = icp?.currency ?? "INR";

      // 2. Perform carbon economics calculations
      const annualEmissionCutTco2e = Math.max(
        0,
        input.baselineAnnualEmissionsTco2e - input.projectedAnnualEmissionsTco2e,
      );
      const annualCarbonValue = annualEmissionCutTco2e * shadowPricePerTco2e;
      const totalAnnualBenefit = input.operationalAnnualSavings + annualCarbonValue;

      // Payback periods
      const traditionalPaybackYears =
        input.operationalAnnualSavings > 0
          ? Number((input.capexAmount / input.operationalAnnualSavings).toFixed(2))
          : null;

      const carbonAdjustedPaybackYears =
        totalAnnualBenefit > 0 ? Number((input.capexAmount / totalAnnualBenefit).toFixed(2)) : null;

      // Discounted Cash Flow NPV Calculation
      const r = input.discountRatePercent / 100;
      let traditionalNpv = -input.capexAmount;
      let carbonAdjustedNpv = -input.capexAmount;

      for (let year = 1; year <= input.projectLifespanYears; year++) {
        const discountFactor = Math.pow(1 + r, year);
        traditionalNpv += input.operationalAnnualSavings / discountFactor;
        carbonAdjustedNpv += totalAnnualBenefit / discountFactor;
      }

      // 3. Persist evaluation if shadowPriceId exists
      if (shadowPriceId) {
        await sql.begin(async (tx) => {
          const [saved] = await tx<{ id: string }[]>`
          insert into public.capex_carbon_evaluations (
            org_unit_id, project_name, baseline_annual_emissions_tco2e,
            projected_annual_emissions_tco2e, capex_amount, operational_annual_savings,
            project_lifespan_years, carbon_price_id, created_by
          ) values (
            ${input.orgUnitId}, ${input.projectName}, ${input.baselineAnnualEmissionsTco2e},
            ${input.projectedAnnualEmissionsTco2e}, ${input.capexAmount}, ${input.operationalAnnualSavings},
            ${input.projectLifespanYears}, ${shadowPriceId}, ${ctx.session.userId}
          )
          returning id
        `;
          await writeAudit(tx, {
            eventType: "icp.capex_evaluated",
            entityType: "capex_carbon_evaluations",
            entityId: saved.id,
            userId: ctx.session.userId,
            newValue: {
              orgUnitId: input.orgUnitId,
              projectName: input.projectName,
              capexAmount: input.capexAmount,
              carbonPriceId: shadowPriceId,
            },
          });
        });
      }

      return {
        projectName: input.projectName,
        currency,
        shadowPricePerTco2e,
        annualEmissionCutTco2e,
        annualCarbonValue,
        traditionalPaybackYears,
        carbonAdjustedPaybackYears,
        paybackAccelerationYears:
          traditionalPaybackYears && carbonAdjustedPaybackYears
            ? Number((traditionalPaybackYears - carbonAdjustedPaybackYears).toFixed(2))
            : null,
        traditionalNpv: Math.round(traditionalNpv),
        carbonAdjustedNpv: Math.round(carbonAdjustedNpv),
        lifetimeCarbonAvoidedTco2e: annualEmissionCutTco2e * input.projectLifespanYears,
      };
    }),
});
