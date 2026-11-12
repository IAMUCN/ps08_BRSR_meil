"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { financialYearLabel } from "@/lib/consolidation/aggregate";
import { share, turnoverRate } from "@/lib/register/register";
import type { RegisterPeople } from "@/lib/register/service";
import type { RegisterOptions, RegisterRow } from "@/lib/trpc/routers/register";
import { confirmRegisterAction, decideRegisterAction, registerPeopleAction } from "./actions";

const STATUS: Record<RegisterRow["status"], string> = {
  pending_verification: "Waiting for HR to confirm the totals",
  verified: "Confirmed, waiting for an approver",
  approved: "Approved",
  returned: "Returned",
};

const pct = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)} %`);

function Summary({ t }: { t: RegisterRow["totals"] }) {
  const sum = (c: "employee" | "worker") =>
    t.headcount[c].permanent.total + t.headcount[c].other.total;
  const turnover = (c: "employee" | "worker") =>
    turnoverRate(
      t.permanent[c].leavers.total,
      t.permanent[c].opening.total,
      t.permanent[c].closing.total,
    );
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      <div>
        <dt className="inline text-muted-foreground">Headcount at {t.asAt}: </dt>
        <dd className="inline font-medium">
          {sum("employee")} employees, {sum("worker")} workers
        </dd>
      </div>
      <div>
        <dt className="inline text-muted-foreground">Permanent turnover: </dt>
        <dd className="inline font-medium">
          employees {pct(turnover("employee"))}, workers {pct(turnover("worker"))}
        </dd>
      </div>
      <div>
        <dt className="inline text-muted-foreground">Women&apos;s share of wages: </dt>
        <dd className="inline font-medium">{pct(share(t.wages.female, t.wages.total))}</dd>
      </div>
      <div>
        <dt className="inline text-muted-foreground">Wages in smaller towns: </dt>
        <dd className="inline font-medium">
          {t.wages.rowsWithPlace === 0
            ? "not captured"
            : pct(share(t.wages.smallerTowns, t.wages.total))}
        </dd>
      </div>
      {t.wages.rowsWithoutWage > 0 ? (
        <p className="text-status-warning sm:col-span-2">
          {t.wages.rowsWithoutWage} people have no wage in the file, so the wage shares leave them
          out.
        </p>
      ) : null}
    </dl>
  );
}

export function RegisterManager({
  options,
  registers,
}: {
  options: RegisterOptions | null;
  registers: RegisterRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problems, setProblems] = useState<{ row: number; reason: string }[] | null>(null);
  const [people, setPeople] = useState<RegisterPeople | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    setProblems(null);
    startTransition(async () => {
      const response = await fetch("/api/employee-register", { method: "POST", body });
      const result = await response
        .json()
        .catch(() => ({ ok: false, error: "The upload failed." }));
      if (!result.ok) {
        toast.error(result.error ?? "The upload failed.");
        if (result.problems) setProblems(result.problems);
        return;
      }
      toast.success("Register read. Check the totals, then confirm them.");
      form.reset();
      router.refresh();
    });
  }

  function run(
    action: () => Promise<
      { ok: true } | { ok: false; error: string } | { ok: true; data: unknown }
    >,
    done: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return void toast.error(result.error);
      toast.success(done);
      setReturning(null);
      setNote("");
      router.refresh();
    });
  }

  function openPeople(id: string) {
    startTransition(async () => {
      const result = await registerPeopleAction({ id });
      if (!result.ok) return void toast.error(result.error);
      setPeople(result.data);
    });
  }

  return (
    <div className="space-y-4">
      {options?.canManage ? (
        <form onSubmit={upload} className="grid gap-3 rounded-md border bg-card p-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="reg-unit">Org unit</Label>
            <NativeSelect id="reg-unit" name="orgUnitId" required>
              {options.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-year">Financial year</Label>
            <NativeSelect
              id="reg-year"
              name="financialYear"
              defaultValue={options.defaultYear ?? undefined}
              required
            >
              {options.years.map((y) => (
                <option key={y} value={y}>
                  {financialYearLabel(y)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="reg-file">Register (Excel or CSV, up to 10 MB)</Label>
            <Input id="reg-file" name="file" type="file" accept=".xlsx,.xls,.csv" required />
          </div>
          <div className="flex flex-wrap items-center gap-3 md:col-span-4">
            <Button type="submit" disabled={pending}>
              {pending ? "Reading…" : "Upload register"}
            </Button>
            <a
              href="/api/employee-register/template"
              className="text-sm underline underline-offset-2"
            >
              Download the template
            </a>
            <span className="text-xs text-muted-foreground">
              Headcount is as at 31 March; leavers are people with a date of leaving in the year.
            </span>
          </div>
        </form>
      ) : null}

      {problems ? (
        <div
          role="alert"
          className="rounded-md border border-status-error/50 bg-status-error/10 p-3 text-sm"
        >
          <p className="font-medium">
            Nothing was saved. Fix these rows in the file and upload it again:
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {problems.map((p) => (
              <li key={p.row}>
                Row {p.row}: {p.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="space-y-3">
        {registers.map((r) => (
          <li key={r.id} className="space-y-3 rounded-md border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">
                {r.orgUnitName} · {financialYearLabel(r.financialYear)}
              </h2>
              <span className="text-sm text-muted-foreground">{STATUS[r.status]}</span>
            </div>
            <Summary t={r.totals} />
            <p className="text-xs text-muted-foreground">
              {r.fileName} · uploaded by {r.uploadedBy}
              {r.verifiedBy ? ` · confirmed by ${r.verifiedBy}` : ""}
              {r.decisionNote ? ` · note: ${r.decisionNote}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {r.can.confirm ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => confirmRegisterAction({ id: r.id }), "Totals confirmed.")
                  }
                >
                  Confirm the totals
                </Button>
              ) : null}
              {r.can.decide ? (
                <>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => decideRegisterAction({ id: r.id, decision: "approve" }),
                        "Register approved.",
                      )
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => setReturning(returning === r.id ? null : r.id)}
                  >
                    Return…
                  </Button>
                </>
              ) : null}
              {r.can.open ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => openPeople(r.id)}
                  >
                    Who has an account
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/employee-register/${r.id}/file`}>Open the file</a>
                  </Button>
                </>
              ) : null}
            </div>
            {returning === r.id ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-64 flex-1 space-y-1">
                  <Label htmlFor={`note-${r.id}`}>
                    Why is it returned? (10 characters or more)
                  </Label>
                  <Input
                    id={`note-${r.id}`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={1000}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={pending || note.trim().length < 10}
                  onClick={() =>
                    run(
                      () => decideRegisterAction({ id: r.id, decision: "return", note }),
                      "Register returned.",
                    )
                  }
                >
                  Return it
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {people ? (
        <section
          aria-labelledby="people-heading"
          className="space-y-2 rounded-md border bg-card p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="people-heading" className="text-base font-semibold">
              Accounts for the people in {people.fileName}
            </h2>
            <Button size="sm" variant="ghost" onClick={() => setPeople(null)}>
              Close
            </Button>
          </div>
          <p className="text-sm">
            {people.counts.active} of {people.counts.total} have an active account,{" "}
            {people.counts.deactivated} a deactivated one, {people.counts.none} none. Matched on
            employee ID; worked out now from the file and not stored.
          </p>
          <div className="max-h-96 overflow-auto rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-table-header text-table-header-foreground">
                <tr>
                  {["Employee ID", "Name", "Account"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-3 py-2 text-left text-[11px] font-medium tracking-wide uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.people.map((p) => (
                  <tr key={p.employeeId} className="border-t border-table-border">
                    <td className="px-3 py-1.5 font-mono">{p.employeeId}</td>
                    <td className="px-3 py-1.5">{p.name ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      {p.status === "active"
                        ? "Active"
                        : p.status === "deactivated"
                          ? "Deactivated"
                          : "No account"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
