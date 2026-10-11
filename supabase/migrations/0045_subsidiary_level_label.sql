-- Owner's page feedback, 2026-10-11: the second level reads "Subsidiary", not "Subsidiary / Entity" (the
-- name 0037 seeded from the PRD's hierarchy diagram). Only the label changes; the level's code and position
-- stay, so no org unit is touched. A label an Admin has already changed is left alone.
update public.org_levels set label = 'Subsidiary'
where code = 'subsidiary' and label = 'Subsidiary / Entity';
