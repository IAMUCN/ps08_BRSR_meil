// Four financial years of approved emissions under a group of the test's own, for Phase 7 (Carbon Analytics).
// Records and calculations are inserted directly (as the database tests do), so the trends have history to
// show; `removeFixture` takes everything it made away again, including the alerts and notifications the daily
// check raised on it. Calculations are append-only for every role, so the removal switches triggers off for
// its own transaction only (session_replication_role = replica) and deletes nothing but the fixture's rows.
//
//   Grid electricity (Scope 2): 10 t a month, every July 20 t; July 2026 40 t.
//   Diesel (Scope 1): 5 t a month, 8 t from April 2026.
//   Business travel by air (Scope 3): 2 t a month throughout.
// With today between August 2026 and January 2027 the daily check finds Scope 2 for July 2026 and Scope 1
// for the months of 2026 that ended within 180 days, for the project and for its group.

export const FIXTURE_TODAY = { from: "2026-08-01", to: "2027-01-27" };

export async function createFixture(sql, run, submittedBy) {
  const [group] = await sql`
    insert into public.org_units (parent_id, unit_type, name, code)
    values (null, 'group', ${`E2E Analytics group ${run}`}, ${`AN-G-${run}`}) returning id, name`;
  const [project] = await sql`
    insert into public.org_units (parent_id, unit_type, name, code)
    values (${group.id}, 'project', ${`E2E Analytics project ${run}`}, ${`AN-P-${run}`}) returning id, name`;
  const metric = Object.fromEntries(
    (
      await sql`select code, id from public.esg_metrics
                where code in ('GRID_ELECTRICITY', 'BUSINESS_TRAVEL_AIR', 'DIESEL_CONSUMPTION')`
    ).map((m) => [m.code, m.id]),
  );
  const periods = {};
  for (let i = 0; i < 40; i++) {
    const y = 2023 + Math.floor((3 + i) / 12);
    const m = ((3 + i) % 12) + 1;
    const mm = String(m).padStart(2, "0");
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const [p] = await sql`
      insert into public.reporting_periods (label, start_date, end_date, status)
      values (${`AN ${y}-${mm} ${run}`}, ${`${y}-${mm}-01`}, ${`${y}-${mm}-${last}`}, 'closed')
      returning id`;
    periods[`${y}-${mm}`] = p.id;
  }
  const record = async (key, code, tonnes) => {
    const [r] = await sql`
      insert into public.esg_records (org_unit_id, reporting_period_id, metric_id, submitted_by,
                                      activity_value_verified, activity_unit, verification_status,
                                      approval_status, data_quality_state)
      values (${project.id}, ${periods[key]}, ${metric[code]}, ${submittedBy}, ${tonnes}, 'unit',
              'user_verified', 'approved', 'approved') returning id`;
    await sql`
      insert into public.calculations (esg_record_id, input_value, input_unit, normalized_value,
                                       normalized_unit, result_value, result_unit, engine_version)
      values (${r.id}, ${tonnes}, 'unit', ${tonnes}, 'unit', ${tonnes * 1000}, 'kgCO2e', 'e2e-fixture')`;
  };
  for (const key of Object.keys(periods)) {
    await record(key, "GRID_ELECTRICITY", key === "2026-07" ? 40 : key.endsWith("-07") ? 20 : 10);
    await record(key, "DIESEL_CONSUMPTION", key >= "2026-04" ? 8 : 5);
    await record(key, "BUSINESS_TRAVEL_AIR", 2);
  }
  return { group, project, periods: Object.values(periods), units: [group.id, project.id] };
}

export async function removeFixture(sql, fixture) {
  if (!fixture) return;
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`delete from public.emission_alert_sends where alert_id in
             (select id from public.emission_alerts where org_unit_id = any(${fixture.units}::uuid[]))`;
    await tx`delete from public.emission_alerts where org_unit_id = any(${fixture.units}::uuid[])`;
    await tx`delete from public.notifications where type = 'emission_alert'
             and (message like ${`%${fixture.project.name}%`} or message like ${`%${fixture.group.name}%`})`;
    await tx`delete from public.calculations where esg_record_id in
             (select id from public.esg_records where org_unit_id = any(${fixture.units}::uuid[]))`;
    await tx`delete from public.esg_records where org_unit_id = any(${fixture.units}::uuid[])`;
    await tx`delete from public.reporting_periods where id = any(${fixture.periods}::uuid[])`;
    await tx`delete from public.org_units where id = any(${fixture.units}::uuid[])`;
  });
}
