import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeRegister,
  readAmount,
  readDate,
  readEmployment,
  readRegisterRows,
  share,
  sumTotals,
  turnoverRate,
  type RegisterRow,
} from "../lib/register/register.ts";

// The employee register's totals (.grill/role-dashboard-decisions.md). One worked year, by hand.

const row = (over: Partial<RegisterRow> & { employeeId: string }): RegisterRow => ({
  name: null,
  gender: "male",
  category: "employee",
  employment: "permanent",
  differentlyAbled: false,
  joined: "2019-01-01",
  left: null,
  wage: null,
  place: null,
  ...over,
});

// Financial year 2025 = 1 April 2025 to 31 March 2026.
const rows: RegisterRow[] = [
  row({ employeeId: "E1", gender: "female", differentlyAbled: true, wage: 600000, place: "metro" }),
  row({ employeeId: "E2", left: "2025-09-30", wage: 300000, place: "rural" }),
  row({
    employeeId: "E3",
    gender: "female",
    category: "worker",
    joined: "2025-08-01",
    wage: 200000,
    place: "semi_urban",
  }),
  row({
    employeeId: "E4",
    category: "worker",
    employment: "other",
    joined: "2024-01-01",
    wage: 100000,
    place: "urban",
  }),
  // Left before the year began: counted nowhere.
  row({ employeeId: "E5", left: "2025-03-15", wage: 999999, place: "rural" }),
  // Joined and left inside the year: a leaver, in neither the opening nor the closing headcount.
  row({
    employeeId: "E6",
    gender: "female",
    joined: "2025-05-01",
    left: "2025-12-31",
    wage: 150000,
  }),
];

test("headcount is as at 31 March, split by category, employment, gender and disability", () => {
  const t = computeRegister(rows, 2025);
  assert.equal(t.asAt, "2026-03-31");
  assert.deepEqual(
    { f: t.headcount.employee.permanent.female, total: t.headcount.employee.permanent.total },
    { f: 1, total: 1 },
  );
  assert.equal(t.headcount.employee.permanent.differentlyAbled.female, 1);
  assert.equal(t.headcount.worker.permanent.female, 1);
  assert.equal(t.headcount.worker.other.male, 1);
  assert.equal(t.headcount.worker.other.total, 1);
});

test("permanent opening, closing and leavers give the turnover rate from summed counts", () => {
  const p = computeRegister(rows, 2025).permanent.employee;
  assert.deepEqual([p.opening.male, p.opening.female, p.opening.total], [1, 1, 2]);
  assert.equal(p.closing.total, 1);
  assert.deepEqual([p.leavers.male, p.leavers.female, p.leavers.total], [1, 1, 2]);
  // 2 leavers / average(2, 1) = 1.5  ->  133.33 %
  const rate = turnoverRate(p.leavers.total, p.opening.total, p.closing.total);
  assert.ok(rate !== null && Math.abs(rate - 133.3333) < 0.001);
  assert.equal(turnoverRate(0, 0, 0), null);
});

test("wages: those employed at some time in the year; women's share and smaller towns", () => {
  const w = computeRegister(rows, 2025).wages;
  assert.equal(w.total, 1_350_000);
  assert.equal(w.female, 950_000);
  assert.equal(w.smallerTowns, 500_000); // rural 300000 + semi-urban 200000
  assert.equal(w.rowsWithWage, 5);
  assert.equal(w.rowsWithPlace, 4);
  const womens = share(w.female, w.total);
  assert.ok(womens !== null && Math.abs(womens - 70.3704) < 0.001);
  assert.equal(share(1, 0), null);
});

test("a blank joining date reads as joined before, a blank leaving date as still employed", () => {
  const t = computeRegister([row({ employeeId: "X", joined: null })], 2025);
  assert.equal(t.headcount.employee.permanent.total, 1);
  assert.equal(t.permanent.employee.opening.total, 1);
});

test("registers add up, and a different year is left out", () => {
  const one = computeRegister(rows, 2025);
  const two = sumTotals([one, one, computeRegister(rows, 2024)], 2025);
  assert.equal(two.people, 12);
  assert.equal(two.headcount.worker.other.total, 2);
  assert.equal(two.wages.total, 2_700_000);
  assert.equal(two.permanent.employee.leavers.total, 4);
});

test("cells: Excel serial dates, day-first dates, wages and employment words", () => {
  assert.equal(readDate("45383"), "2024-04-01");
  assert.equal(readDate("31-03-2026"), "2026-03-31");
  assert.equal(readDate("31/03/2026"), "2026-03-31");
  assert.equal(readDate("2026-03-31"), "2026-03-31");
  assert.equal(readDate(""), null);
  assert.equal(readDate("31-02-2026"), undefined);
  assert.equal(readDate("tomorrow"), undefined);
  assert.equal(readAmount("₹ 1,20,000"), 120000);
  assert.equal(readAmount("-5"), undefined);
  assert.equal(readAmount(""), null);
  assert.equal(readEmployment("Permanent"), "permanent");
  assert.equal(readEmployment("Other than permanent"), "other");
  assert.equal(readEmployment("Contractual"), "other");
  assert.equal(readEmployment("sometimes"), null);
});

test("a sheet is read by header, whatever the spelling, and every bad row is named", () => {
  const sheet: Record<string, string>[] = [
    {
      "Emp ID": "E1",
      Name: "Asha",
      Gender: "F",
      "Employee Category": "Employee",
      Employment: "Permanent",
      Disability: "Yes",
      DOJ: "01-04-2019",
      "Date of exit": "",
      "Annual Wages": "600000",
      "Location Type": "Metropolitan",
    },
    { "Emp ID": "E1", Gender: "M", "Employee Category": "Worker", Employment: "Contract" },
    { "Emp ID": "E2", Gender: "?", "Employee Category": "Worker", Employment: "Contract" },
    {
      "Emp ID": "E3",
      Gender: "M",
      "Employee Category": "Worker",
      Employment: "Contract",
      DOJ: "01-01-2025",
      "Date of exit": "01-01-2024",
    },
    { "Emp ID": "E4", Gender: "M", "Employee Category": "Worker", Employment: "Contract" },
  ];
  const read = readRegisterRows(sheet);
  assert.deepEqual(read.missingColumns, []);
  assert.equal(read.rows.length, 2);
  assert.equal(read.rows[0].differentlyAbled, true);
  assert.equal(read.rows[0].place, "metro");
  assert.deepEqual(
    read.problems.map((p) => p.row),
    [3, 4, 5],
  );
  assert.match(read.problems[0].reason, /appears twice/);
  assert.match(read.problems[1].reason, /Gender/);
  assert.match(read.problems[2].reason, /before the date of joining/);
});

test("a sheet without a required column is refused as a whole", () => {
  const read = readRegisterRows([
    { "Employee ID": "E1", Category: "Employee", Employment: "Permanent" },
  ]);
  assert.deepEqual(read.missingColumns, ["Gender"]);
  assert.equal(read.rows.length, 0);
});
