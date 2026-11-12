# Conversion factors per financial year
Date: 2026-11-11

## Intent
A conversion factor is the same for a whole financial year (1 April to 31 March). A change never takes effect in
the middle of a year: it starts from the next financial year. Unchanged values carry on into later years.

## Key decisions
- Decision: a version is "effective for FY X to FY Y", chosen as From and To financial years; To defaults to From
  (one year). Stored as 1 April of X and 31 March of Y (migration `0064`, D54, A52). Owner's choice over "one start
  year with the range shown" and "From–To with no inheritance".
- Decision: after its To year a version is inherited by the following years until a newer version starts. The
  calculation engine takes the latest active or superseded version starting on or before the period; the end
  date no longer stops it. The yearly review says "Inherited from FY X". Owner's choice.
- Decision: a new version starts from the next financial year. An earlier year is allowed only when no version
  (active, superseded or draft) of the factor starts on or before the last chosen year, i.e. a first value or
  history before the first value. A wrong value in the current year is corrected from next year. Owner's choice
  over "strictly next year" and "current year with a reason".
- Decision: existing versions move to year boundaries: start to 1 April of its year (only PNG changed, 1 Aug 2026
  to 1 Apr 2026), end to 31 March of its year or of the start year when none. Old dates are kept in audit entries
  (`factor.version_years_set`). Owner's choice ("round down") over rounding up or leaving them.
- Decision (agent's): a database trigger rounds every written version to whole financial years, with checks behind
  it, so scripts and fixtures cannot store a mid-year factor.

## Surfaced assumptions
- On the local database the 704 stored calculations pick the same versions under the new rule (checked); nothing
  approved changes. PNG's April–July 2026 records now have a covering factor but are calculated only when an
  Admin runs the calculation for them.
- "Today" for "the next financial year" is the database's `reporting_period_today()`.

## Out of scope
- Recalculating records automatically when a factor's years change.
