-- The ESG data analyst chatbot (.grill/chat-analyst-decisions.md, deviation D34): a database role that can
-- only read a named list of tables, and two server-only tables for saved conversations.

-- --- The read-only role ------------------------------------------------------------------------------------
-- The chat tools connect as this role (CHAT_DATABASE_URL), so whatever the model is talked into asking for,
-- the database refuses writes and has nothing to say about people, documents, OCR text, the audit log,
-- settings or reports. Org scope is still checked by the server before a tool runs (D1).
-- Created without a password: set one by hand where the chatbot is used
-- (alter role chat_reader login password '…'); a password never belongs in a migration.
do $$
begin
  if not exists (select from pg_roles where rolname = 'chat_reader') then
    create role chat_reader nologin;
  end if;
end $$;
alter role chat_reader set default_transaction_read_only = on;
alter role chat_reader set statement_timeout = '10s';

grant usage on schema public to chat_reader;

-- Whole tables that hold configuration or figures only.
grant select on
  public.reporting_periods, public.scopes, public.esg_metrics, public.calculation_formulas,
  public.metric_field_requirements, public.calculations, public.calculation_inputs,
  public.conversion_factors, public.validation_results,
  public.org_unit_tree, public.consolidation_records
to chat_reader;
-- Tables that also name a person: every column except those.
grant select (id, parent_id, unit_type, name, code, status, deleted_at) on public.org_units to chat_reader;
grant select (id, org_unit_id, reporting_period_id, metric_id, scope_id, activity_value_verified,
              activity_unit, verification_status, validation_status, approval_status, calculation_status,
              data_quality_state, is_duplicate_flag)
  on public.esg_records to chat_reader;
grant select (id, conversion_factor_id, version_number, value, input_unit, output_unit, source_reference,
              geography, effective_from, effective_to, status)
  on public.conversion_factor_versions to chat_reader;
grant select (id, org_unit_id, metric_id) on public.submission_expectations to chat_reader;

-- Row level security is on for these tables and their policies name the browser role, so this role needs its
-- own. All rows: the server narrows every query to the org units the signed-in person may see.
do $$
declare t text;
begin
  foreach t in array array[
    'reporting_periods', 'scopes', 'esg_metrics', 'calculation_formulas', 'metric_field_requirements',
    'calculations', 'calculation_inputs', 'conversion_factors', 'conversion_factor_versions',
    'validation_results', 'org_units', 'esg_records', 'submission_expectations']
  loop
    execute format('create policy chat_reader_select on public.%I for select to chat_reader using (true)', t);
  end loop;
end $$;

-- --- Saved conversations -----------------------------------------------------------------------------------
-- Private to the person who asked. Kept 90 days from the last message; the person can delete one at any time.
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  title text not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index chat_conversations_user_idx on public.chat_conversations (user_id, last_message_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  role text not null constraint chat_messages_role_check check (role in ('user', 'assistant')),
  content text not null,
  -- An answer as it was shown: the tables, figures and charts the server built from the tool results.
  blocks jsonb,
  -- Which approved tools ran, with their arguments (no results).
  tool_calls jsonb,
  -- The org units the answer covers. An answer is hidden once its reader can no longer see one of them.
  org_unit_ids uuid[] not null default '{}',
  model text,
  created_at timestamptz not null default now()
);
create index chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at);

-- Server-only, like rate_limit_events (migration 0027): RLS on, no policies, no browser grants. The
-- read-only role above has no access either.
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_conversations, public.chat_messages from anon, authenticated;

-- --- Who may use the chatbot ------------------------------------------------------------------------------
-- A permission like any other, so an Admin decides per role on Roles & Permissions. Every role that exists
-- today holds it (the chatbot only ever shows a person what their org scope already allows); a role created
-- later gets it when an Admin ticks it.
insert into public.permissions (code, description)
values ('chat.use', 'Ask the ESG data analyst (read-only chatbot) about the ESG data in your org scope.');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = 'chat.use';
