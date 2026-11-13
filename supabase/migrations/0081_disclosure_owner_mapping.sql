-- Migration 0068: which written BRSR answers HR and Finance/CSR may type (DRAFT - the owner has not approved
-- this mapping; read it before applying. .grill/role-dashboard-decisions.md, "Finance / HR mapping").
--
-- Derived from the wording of the 146 questions. Anything not listed here stays Super Admin only: Section A
-- entity identity, boundary and assurance, all of Section B, ethics, product, stakeholder, environment,
-- policy and consumer questions, and the health-and-safety questions (no EHS permission exists yet).
-- Unsure, left Super Admin only for now: P3-E14 (assessments of safety and working conditions),
-- P5-E9 (human-rights clauses in contracts), P8-L3 (preferential procurement), P1-E7.
-- Undo: update public.brsr_indicators set owning_permission = null;

update public.brsr_indicators
set owning_permission = 'disclosure.hr'
where code in (
  'A-20', 'A-21', 'A-22',
  'P1-E1',
  'P3-E1', 'P3-E2', 'P3-E3', 'P3-E4', 'P3-E5', 'P3-E6', 'P3-E7', 'P3-E8', 'P3-E9', 'P3-E13',
  'P3-L1', 'P3-L2', 'P3-L4',
  'P5-E1', 'P5-E2', 'P5-E3', 'P5-E4', 'P5-E5', 'P5-E6', 'P5-E7', 'P5-E8', 'P5-E10', 'P5-E11',
  'P5-L3'
);

update public.brsr_indicators
set owning_permission = 'disclosure.finance'
where code in (
  'A-11', 'A-16', 'A-17', 'A-24',
  'P1-E2', 'P1-E3', 'P1-E8', 'P1-E9',
  'P8-E1', 'P8-E2', 'P8-E3',
  'P8-L1', 'P8-L2', 'P8-L6'
);
