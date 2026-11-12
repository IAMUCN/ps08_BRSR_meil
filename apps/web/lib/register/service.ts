import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { writeAudit } from "@/lib/audit";
import { parseSheetRows } from "@/lib/bulk-import/xlsx";
import { db } from "@/lib/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  computeRegister,
  readRegisterRows,
  type RegisterRow,
  type RegisterTotals,
  type RowProblem,
} from "./register";

// Storing and reading employee registers (migration 0070; .grill/role-dashboard-decisions.md). The file goes to
// the private `registers` bucket; the database keeps only the totals computed from it. The person-level rows
// exist in memory while a file is read, and are never written anywhere.

export const REGISTER_BUCKET = "registers";
export const MAX_REGISTER_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};
export const REGISTER_EXTENSIONS = Object.keys(TYPES);

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120) || "register";

export type IngestResult =
  | { ok: true; id: string; totals: RegisterTotals }
  | { ok: false; error: string; problems?: RowProblem[]; problemCount?: number };

class Refused extends Error {}

/** Reads a register file, refuses it if any row is unusable, stores the file and the totals. */
export async function ingestRegister(input: {
  file: File;
  orgUnitId: string;
  financialYear: number;
  uploadedBy: string;
}): Promise<IngestResult> {
  const { file, orgUnitId, financialYear, uploadedBy } = input;
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_REGISTER_BYTES)
    return { ok: false, error: "The register must be 10 MB or smaller." };
  const extension = extensionOf(file.name);
  if (!TYPES[extension]) return { ok: false, error: "Upload an Excel (.xlsx, .xls) or CSV file." };

  let rows: RegisterRow[];
  try {
    const read = readRegisterRows(await parseSheetRows(file));
    if (read.missingColumns.length > 0) {
      return {
        ok: false,
        error: `The register has no ${read.missingColumns.join(", ")} column. Use the template's headings.`,
      };
    }
    if (read.problems.length > 0) {
      return {
        ok: false,
        error:
          "Some rows cannot be used. Fix them in the file and upload it again; nothing was saved.",
        problems: read.problems.slice(0, 50),
        problemCount: read.problems.length,
      };
    }
    if (read.rows.length === 0) return { ok: false, error: "The register has no people in it." };
    rows = read.rows;
  } catch {
    return { ok: false, error: "That file could not be read as a spreadsheet." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  const totals = computeRegister(rows, financialYear);
  const path = `${orgUnitId}/${financialYear}/${randomUUID()}-${safeName(file.name)}`;

  const storage = createSupabaseAdminClient().storage.from(REGISTER_BUCKET);
  const uploaded = await storage.upload(path, bytes, { contentType: TYPES[extension] });
  if (uploaded.error) return { ok: false, error: "The file could not be stored. Try again." };

  try {
    const id = await db().begin(async (tx) => {
      const live = await tx<{ id: string; status: string }[]>`
        select id, status from public.employee_registers
        where org_unit_id = ${orgUnitId} and financial_year = ${financialYear}
          and status in ('pending_verification', 'verified', 'approved')
        for update`;
      if (live.some((r) => r.status === "approved")) {
        throw new Refused(
          "An approved register already exists for this unit and year. An approver must return it before a new one is uploaded.",
        );
      }
      if (live.length > 0) {
        await tx`update public.employee_registers set status = 'superseded' where id = any(${live.map((r) => r.id)}::uuid[])`;
      }
      const [created] = await tx<{ id: string }[]>`
        insert into public.employee_registers
          (org_unit_id, financial_year, storage_path, file_name, file_hash, file_size_bytes, totals, uploaded_by)
        values (${orgUnitId}, ${financialYear}, ${path}, ${file.name.slice(0, 255)}, ${hash}, ${file.size},
                ${tx.json(totals)}, ${uploadedBy})
        returning id`;
      await writeAudit(tx, {
        eventType: "employee_register.uploaded",
        entityType: "employee_register",
        entityId: created.id,
        userId: uploadedBy,
        // Counts and the file's name only: nothing about any person.
        newValue: {
          org_unit_id: orgUnitId,
          financial_year: financialYear,
          file_name: file.name.slice(0, 255),
          people: totals.people,
          file_hash: hash,
        },
      });
      return created.id;
    });
    return { ok: true, id, totals };
  } catch (error) {
    await storage.remove([path]);
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

export type AccountStatus = "active" | "deactivated" | "none";

export type RegisterPeople = {
  fileName: string;
  financialYear: number;
  people: { employeeId: string; name: string | null; status: AccountStatus }[];
  counts: { total: number; active: number; deactivated: number; none: number };
};

/** Downloads a stored register. Returns null when the object is gone. */
export async function downloadRegister(storagePath: string): Promise<Blob | null> {
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(REGISTER_BUCKET)
    .download(storagePath);
  return error || !data ? null : data;
}

/**
 * Who in the register has an EmeilSG account, matched on employee ID. Worked out from the file each time it is
 * opened and never stored; shows IDs and names only — no gender, disability or wages.
 */
export async function registerPeople(register: {
  storage_path: string;
  file_name: string;
  financial_year: number;
}): Promise<RegisterPeople | null> {
  const blob = await downloadRegister(register.storage_path);
  if (!blob) return null;
  const read = readRegisterRows(await parseSheetRows(new File([blob], register.file_name)));
  const lowered = read.rows.map((r) => r.employeeId.toLowerCase());
  const accounts = lowered.length
    ? await db()<{ employee_id: string; is_active: boolean }[]>`
        select lower(employee_id) as employee_id, is_active from public.users
        where deleted_at is null and lower(employee_id) = any(${lowered}::text[])`
    : [];
  const byId = new Map(accounts.map((a) => [a.employee_id, a.is_active]));
  const people = read.rows.map((r) => {
    const active = byId.get(r.employeeId.toLowerCase());
    const status: AccountStatus = active === undefined ? "none" : active ? "active" : "deactivated";
    return { employeeId: r.employeeId, name: r.name, status };
  });
  const count = (s: AccountStatus) => people.filter((p) => p.status === s).length;
  return {
    fileName: register.file_name,
    financialYear: register.financial_year,
    people,
    counts: {
      total: people.length,
      active: count("active"),
      deactivated: count("deactivated"),
      none: count("none"),
    },
  };
}
