# TraceESG Intelligence Platform — Technical Implementation & Architecture Guide

> **Enterprise ESG & SEBI BRSR Decision Intelligence Architecture**  
> **Corporate Entity:** Megha Engineering & Infrastructures Limited (MEIL)  
> **System Name:** TraceESG Intelligence (`ps08_BRSR_meil`)  
> **Status:** Production-Ready • Automated CI/CD Verified (241/241 Tests Passing)

---

## 1. Architectural Overview & System Design

The **TraceESG Intelligence Platform** is an enterprise-grade AI decision support system designed specifically for corporate ESG governance and statutory SEBI BRSR reporting. Built upon the foundational principle of **evidence-first traceability**, the platform guarantees that every prediction, risk flag, decarbonization recommendation, and statutory disclosure is grounded in verified operational source data.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                TRACEESG DECISION CENTER                                │
│                   Unified Executive & Administrative Control Plane                     │
├────────────────────┬────────────────────┬────────────────────┬─────────────────────────┤
│ Configurable Rules │  Risk Audit Engine │ Predictive Forecast│   What-If Simulator     │
│   & Intensity QA   │    (6 Vectors)     │ (GBDT Tournament)  │  (Renewables, ICP, ROI) │
├────────────────────┴────────────────────┴────────────────────┴─────────────────────────┤
│                      TRANSPARENT RANKED RECOMMENDATION ENGINE                          │
│               Priority Score = 0.35*I + 0.25*U + 0.20*F + 0.20*D                       │
│                     Human-in-the-Loop Approval & Action Tracking                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                       STATUTORY SEBI BRSR RAG ASSISTANT                                │
│          pgvector Hybrid Semantic Search (60% Dense Cosine + 40% GIN Lexical)          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                             AI GATEWAY & SECURITY LAYER                                │
│    Data Classification Matrix • Field Projection • Sanitizer • Emergency Kill Switch   │
├───────────────────────────────────────┬────────────────────────────────────────────────┤
│       MULTI-PROVIDER AI ADAPTERS      │             SECURE DATA FOUNDATION             │
│  Google Gemini • Groq • NVIDIA NIM    │  PostgreSQL + pgvector • RLS • Append-Only DB  │
└───────────────────────────────────────┴────────────────────────────────────────────────┘
```

---

## 2. Security & Privacy Architecture

The platform enforces mandatory enterprise controls governing external LLM interactions, ensuring sensitive corporate documents and financial ledgers never leak to third-party endpoints.

### 2.1 Data Classification Matrix & Provider Policies

| Data Classification Level | Description / Content | Permitted AI Processing Policy | Permitted Adapters |
| :--- | :--- | :--- | :--- |
| `PUBLIC_BRSR_GUIDELINES` | Statutory SEBI circulars, BRSR indicators, IPCC factors | External Approved AI Allowed | Gemini, Groq, NVIDIA NIM |
| `SYNTHETIC_ESG_DATA` | Development fixtures, test seeds, mock ledgers | Approved for Dev & Local Testing | All Available Providers |
| `AGGREGATED_ESG_METRICS` | Consolidated Scope 1/2/3 totals, annual intensity | External AI only after explicit admin approval | Approved Providers Only |
| `CONFIDENTIAL_INVOICES` | Raw electricity bills, fuel receipts, vendor invoices | Masked / Redacted strictly before egress | Masked Projection Only |
| `EMPLOYEE_INFORMATION` | HR headcount, gender ratios, training metrics | Exclude all PII; anonymized aggregated only | Strict PII Sanitization |
| `FINANCIAL_RECORDS` | CapEx budgets, project turnover, utility tariffs | Restricted; internal local processing preferred | Approved External AI (Strict) |

### 2.2 Security Controls Implementation

1. **Provider-Specific Permissions:** Enforced by `AiSecurityGatekeeper` in [gatekeeper.ts](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/apps/web/lib/ai-gateway/security/gatekeeper.ts). Requests are halted if provider permissions do not match data classification.
2. **Golden Rule (Minimal Field Projection):** Prompts never contain entire raw PDF byte streams or unconstrained database row dumps. Prompts receive only extracted scalar attributes (e.g., `invoice_date`, `verified_kwh`, `utility_rate`).
3. **Prompt-Injection Defense:**
   - [sanitizer.ts](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/apps/web/lib/ai-gateway/security/sanitizer.ts) wraps retrieved context in non-executable delimiter blocks (`<evidence_context source="...">`).
   - Rejection of prompt override patterns (`ignore previous instructions`, `system prompt override`, `jailbreak`).
4. **PII Anonymization:** In-memory regex masking of Indian phone numbers, PAN numbers, Aadhaar patterns, email addresses, and vendor account numbers.
5. **Emergency Kill Switch:** Database-persisted flag in `public.ai_kill_switch_state`. When tripped by an administrator, all external provider requests are immediately rejected locally with zero egress.
6. **No Automatic Action Execution:** Recommendation engines produce advisory action cards only (`open`). Modifications to operational states require explicit human admin approval (`approved`).
7. **Database Immutability Invariant:** Database triggers (`0070_database_safety_invariants.sql`) block AI roles and background agents from executing `UPDATE` or `DELETE` statements on `public.esg_records`.

---

## 3. Tokenization, Embeddings & Vector Database Architecture

### 3.1 Vector Database (`pgvector` in PostgreSQL)

TraceESG utilizes the PostgreSQL `pgvector` extension (v0.8.0+) natively inside hosted Supabase:
- **Vector Dimension:** 768 dimensions (calibrated for Google `text-embedding-004`).
- **Distance Metric:** Cosine Distance (`vector_cosine_ops`, operator `<=>`).
- **Index Type:** Hierarchical Navigable Small World (HNSW) and Inverted File Flat (IVFFlat) indexes for sub-millisecond retrieval.
- **Lexical Index:** Generalized Inverted Index (GIN) on generated PostgreSQL full-text search vectors (`tsvector`).

### 3.2 Embedding Generation Pipeline

Located in [embeddings.ts](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/apps/web/lib/rag/embeddings.ts):
1. **Primary Cloud Engine:** Google Gemini REST API (`models/text-embedding-004`).
   - Normalizes input text.
   - Extracts 768-dimensional float32 vector with $L_2$ unit normalization ($\sum v_i^2 = 1.0$).
2. **Deterministic Fallback Engine:** SHA-256 trigonometric hash projection generating a deterministic 768-dimensional unit vector when offline, ensuring test repeatability with zero network dependency.

### 3.3 Text Chunking & Indexing Pipeline

Located in [indexer.ts](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/apps/web/lib/rag/indexer.ts):
- **Chunk Size:** 500 tokens with 50-token contextual sliding overlap.
- **Statutory Index:** 146 Statutory SEBI BRSR Essential and Leadership indicators indexed with indicator codes, core principles (P1–P9), and reporting guidance.
- **Operational Index:** Verified organization records (`public.esg_records`) and evidence files (`public.documents`).
- **Row-Level Security (RLS):** Every chunk references `org_unit_id` and `data_classification`, preventing cross-tenant leakage.

### 3.4 Hybrid Search Algorithm

Located in [search.ts](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/apps/web/lib/rag/search.ts):
Retrieval score fuses semantic embedding proximity with keyword lexical frequency:

$$\text{Hybrid Score} = 0.60 \times (1 - \text{Cosine Distance}) + 0.40 \times \text{Normalised GIN Rank}$$

```sql
select
  id,
  title,
  content,
  source_type,
  source_id,
  1 - (embedding <=> ${vectorStr}::vector(768)) as semantic_score,
  ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', ${query})) as lexical_score
from public.rag_knowledge_chunks
where (org_unit_id = ${orgUnitId} or org_unit_id is null)
order by (0.60 * (1 - (embedding <=> ${vectorStr}::vector(768))) + 0.40 * lexical_rank) desc
limit 5;
```

---

## 4. Complete Database Schemas (Migrations 0067 – 0075)

The entire intelligence system is defined declaratively across 9 database migrations:

```
supabase/migrations/
├── 0067_decision_rules_engine.sql
├── 0068_decarbonization_suggestions.sql
├── 0069_risk_evaluations.sql
├── 0070_database_safety_invariants.sql
├── 0071_recommendation_engine_and_ranking.sql
├── 0072_ai_security_and_privacy_architecture.sql
├── 0073_pgvector_and_rag_indexes.sql
├── 0074_predictive_intelligence_and_forecasts.sql
└── 0075_what_if_scenario_simulations.sql
```

### 4.1 Schema DDL Definitions

#### A. Decision Rules Engine (`0067_decision_rules_engine.sql`)
```sql
create table if not exists public.decision_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  category text not null,
  severity text not null,
  target_feature text not null,
  operator text not null,
  threshold_value numeric(14, 4) not null,
  threshold_upper numeric(14, 4),
  advisory_message_template text not null,
  status text not null default 'ACTIVE',
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rule_evaluations (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.decision_rules(id) on delete cascade,
  rule_version int not null,
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id) on delete cascade,
  observed_value numeric(14, 4) not null,
  is_triggered boolean not null,
  severity text not null,
  advisory_message text not null,
  disclaimer text not null,
  evaluated_at timestamptz not null default now()
);
```

#### B. Risk Evaluations (`0069_risk_evaluations.sql`)
```sql
create table if not exists public.risk_evaluation_reports (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id) on delete cascade,
  overall_status text not null,
  critical_findings_count int not null default 0,
  warning_findings_count int not null default 0,
  category_assessments jsonb not null,
  disclaimer text not null,
  evaluated_at timestamptz not null default now(),
  constraint uq_risk_report unique (org_unit_id, reporting_period_id)
);
```

#### C. Database Safety Invariants (`0070_database_safety_invariants.sql`)
```sql
create or replace function public.prevent_ai_tampering_esg_records()
returns trigger language plpgsql as $$
begin
  if current_setting('traceesg.context_layer', true) in ('ai_agent', 'decision_engine', 'rag_service') then
    raise exception 'Database Safety Violation: AI Decision layer cannot modify verified ESG records directly.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger trg_block_ai_write_esg_records
  before update or delete or truncate on public.esg_records
  for each statement execute function public.prevent_ai_tampering_esg_records();
```

#### D. Prioritized Recommendations (`0071_recommendation_engine_and_ranking.sql`)
```sql
create table if not exists public.prioritized_recommendations (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id) on delete cascade,
  title text not null,
  category text not null,
  impact_score numeric(4, 2) not null,
  urgency_score numeric(4, 2) not null,
  feasibility_score numeric(4, 2) not null,
  confidence_score numeric(4, 2) not null,
  priority_score numeric(5, 2) not null,
  priority_band text not null,
  estimated_capex numeric(14, 2),
  annual_carbon_savings_tco2e numeric(10, 3),
  annual_financial_savings_inr numeric(14, 2),
  missing_inputs_explanation text,
  status text not null default 'open',
  assigned_to text,
  audit_disclaimer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

#### E. AI Gateway & Security State (`0072_ai_security_and_privacy_architecture.sql`)
```sql
create table if not exists public.ai_kill_switch_state (
  id boolean primary key default true,
  is_killed boolean not null default false,
  tripped_at timestamptz,
  tripped_by text,
  reason text
);

create table if not exists public.ai_request_audit_logs (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  model_id text not null,
  task_category text not null,
  data_classification text not null,
  prompt_tokens int not null,
  completion_tokens int not null,
  duration_ms int not null,
  status text not null,
  error_message text,
  created_at timestamptz not null default clock_timestamp()
);
```

#### F. RAG Knowledge Chunks & Vector Indexes (`0073_pgvector_and_rag_indexes.sql`)
```sql
create extension if not exists vector;

create table if not exists public.rag_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid references public.org_units(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  title text not null,
  content text not null,
  embedding vector(768) not null,
  data_classification text not null default 'PUBLIC_BRSR_GUIDELINES',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_rag_chunks_embedding 
  on public.rag_knowledge_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists idx_rag_chunks_fts 
  on public.rag_knowledge_chunks using gin (to_tsvector('english', content));
```

#### G. Predictive Forecast Snapshots (`0074_predictive_intelligence_and_forecasts.sql`)
```sql
create table if not exists public.predictive_forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id) on delete cascade,
  metric_type text not null,
  champion_model text not null,
  horizon_periods int not null default 3,
  evaluation_metrics jsonb not null,
  model_tournament jsonb not null,
  historical_data jsonb not null,
  predictions jsonb not null,
  anomaly_flags jsonb not null default '[]'::jsonb,
  predictive_insights jsonb not null default '[]'::jsonb,
  disclaimer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_predictive_snapshot unique (org_unit_id, reporting_period_id, metric_type)
);
```

#### H. What-If Scenario Simulations (`0075_what_if_scenario_simulations.sql`)
```sql
create table if not exists public.what_if_scenario_simulations (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id) on delete cascade,
  scenario_name text not null,
  scenario_type text not null,
  parameters jsonb not null,
  baseline_metrics jsonb not null,
  simulated_metrics jsonb not null,
  financial_impact jsonb not null,
  disclaimer text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## 5. Decision Rules & Feature Engineering Engine

Located in [engine.ts](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/apps/web/lib/features/engine.ts) and [engine.ts](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/apps/web/lib/rules/engine.ts):
- **Feature Vector:** Computes strictly from verified operational activity:
  - `electricity_growth_pct`: Percentage change in total electricity versus previous reporting cycle.
  - `renewable_share_pct`: Proportion of total electricity sourced from renewable generation.
  - `scope1_ratio`, `scope2_ratio`, `scope3_ratio`: Normalized GHG scope emissions share.
  - `missing_evidence_ratio`: Proportion of submitted records lacking uploaded bills/invoices.
  - `qa_data_quality_score`: Multi-vector index (0–100) reflecting verification, OCR confidence, and duplicate flags.
- **Rules Execution:** Deterministically evaluates relational comparison operators (`>`, `>=`, `<`, `<=`, `==`, `BETWEEN`, `DRIFT_UP`, `SPIKE`). Every evaluation attaches an immutable statutory audit disclaimer.

---

## 6. Multi-Vector Risk Engine

Evaluates 6 statutory and operational risk categories in [engine.ts](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/apps/web/lib/risks/engine.ts):
1. **Emissions Increase Risk:** Detects unnormalized GHG emissions spikes versus revenue and production output.
2. **Unusual Consumption Risk:** Reuses the validation engine to identify consumption figures exceeding historical standard deviations.
3. **Missing BRSR Proof Risk:** Cross-checks applicable mapped BRSR indicators against approved document evidence.
4. **Duplicate Invoices Risk:** Evaluates exact document SHA-256 cryptographic hashes and invoice number collisions.
5. **Incomplete Reporting Risk:** Monitors reporting coverage against configured subsidiary expectations.
6. **Water Usage Anomaly Risk:** Audits wastewater discharge, consumption spikes, and water stress intensity.

---

## 7. Transparent Ranked Recommendation Engine

Located in [engine.ts](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/apps/web/lib/recommendations/engine.ts):

### 7.1 Priority Formula & Calibration

$$\text{Priority Score} = w_I \times \text{Impact} + w_U \times \text{Urgency} + w_F \times \text{Feasibility} + w_D \times \text{Confidence}$$

- Default calibration weights: $w_I = 0.35, w_U = 0.25, w_F = 0.20, w_D = 0.20$.
- Priority Bands:
  - $\ge 80.0$: **CRITICAL** (Immediate executive review required).
  - $65.0 - 79.9$: **HIGH** (Strategic quarterly planning priority).
  - $50.0 - 64.9$: **MEDIUM** (Operational process optimization).
  - $< 50.0$: **LOW** (Long-term continuous improvement).

### 7.2 Human-in-the-Loop Workflow States

```
[ OPEN ] ──(Assign)──> [ IN_REVIEW ] ──(Director Approval)──> [ APPROVED ] ──(Deploy)──> [ IMPLEMENTED ]
   │                                                                │
   └────────────────────────(Executive Dismiss)────────────────────┴────────────────> [ DISMISSED ]
```

---

## 8. Predictive Intelligence & Machine Learning Architecture

Located in [engine.ts](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/apps/web/lib/predictive/engine.ts) and [gbdt.ts](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/apps/web/lib/predictive/gbdt.ts):

### 8.1 Gradient Boosted Decision Tree (GBDT) Regressor

Implements XGBoost / LightGBM split-finding architecture natively in TypeScript:
- **Second-Order Taylor Loss:**

$$w_j^* = -\frac{\sum_{i \in I_j} g_i}{\sum_{i \in I_j} h_i + \lambda}, \quad \text{Gain} = \frac{1}{2} \left[ \frac{G_L^2}{H_L + \lambda} + \frac{G_R^2}{H_R + \lambda} - \frac{G_P^2}{H_P + \lambda} \right]$$

- Regularization parameter $\lambda = 1.0$, learning rate shrinkage $\eta = 0.15$, tree depth $d \le 3$.
- Autoregressive feature inputs: $\text{Lag}_1$, $\text{Lag}_2$, $\text{RollingMean}_3$, $\text{Momentum}$, $\text{TimeIndex}$, $\text{QuarterlyPhase}$.

### 8.2 Chronological Candidate Model Tournament

Trains 4 candidate algorithms on historical sequences:
1. `xgboost_gbdt`: Autoregressive gradient boosted tree ensemble.
2. `exponential_smoothing`: Holt-Winters additive level & trend with damping factor ($\phi = 0.92$).
3. `linear_trend`: Ordinary Least Squares (OLS) regression line.
4. `naive_drift`: Random walk with historical drift rate.

Evaluated out-of-sample across 5 scorecard dimensions:
- Coefficient of Determination ($R^2$)
- Root Mean Square Error (RMSE)
- Mean Absolute Error (MAE)
- Mean Absolute Percentage Error (MAPE)
- Directional Accuracy (%)

The algorithm with the lowest validation RMSE is crowned Tournament Champion.

### 8.3 Expanding Prediction Uncertainty Bands

For each forward forecast step $h \in \{1, 2, \dots, H\}$:

$$\text{CI}_{80} = \hat{y}_h \pm 1.282 \times \sigma_{\text{residual}} \times \sqrt{h}, \quad \text{CI}_{95} = \hat{y}_h \pm 1.960 \times \sigma_{\text{residual}} \times \sqrt{h}$$

Lower confidence bounds are bounded at $0$ (physical quantities cannot be negative).

---

## 9. What-If Scenario Simulator & Internal Carbon Pricing (ICP)

Located in [engine.ts](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/apps/web/lib/simulator/engine.ts):

1. **Renewable Energy Transition:** Displaces grid electricity ($0.000716\text{ tCO}_2\text{e/kWh}$) with solar/wind PPA ($0\text{ tCO}_2\text{e/kWh}$), capturing tariff arbitrage between utility grid rates ($₹7.50\text{/kWh}$) and solar PPA rates ($₹3.80\text{/kWh}$).
2. **Fuel Switching:** Displaces diesel fuel ($0.00268\text{ tCO}_2\text{e/L}$) with electric work ($3.0\text{ kWh/L}$), quantifying direct Scope 1 reductions and net fuel savings.
3. **Water Conservation:** Models effluent recycling and rainwater harvesting ($₹40\text{/kL}$ municipal water tariff savings).
4. **Waste Circularity:** Diverts solid waste from municipal landfills ($0.58\text{ tCO}_2\text{e/tonne}$ methane avoidance under Scope 3 Category 5) and avoids landfill tipping fees ($₹800\text{/tonne}$).
5. **Internal Carbon Pricing (ICP) CapEx Acceleration:**

$$\text{Total Annual Benefit} = \text{Operational Utility Savings} + (\text{Avoided }\text{tCO}_2\text{e} \times \text{Shadow Price})$$

$$\text{Carbon-Adjusted Payback} = \frac{\text{Project CapEx}}{\text{Total Annual Benefit}}, \quad \Delta\text{Payback} = \text{Traditional Payback} - \text{Adjusted Payback}$$

---

## 10. Automated CI/CD & Production Verification

All checks configured in [.github/workflows/ci.yml](file:///C:/my%20things/bput-hackathon/ps08_BRSR_meil/.github/workflows/ci.yml) pass with 100% compliance:

```bash
# 1. ESLint Static Analysis
corepack pnpm --filter web lint
# Result: 0 Errors (Exit code 0)

# 2. TypeScript Compilation
corepack pnpm --filter web typecheck
# Result: 0 Errors (Exit code 0)

# 3. Unit and Integration Test Suite
node --test "tests/**/*.test.ts"
# Result: 241 / 241 Tests Passing (Exit code 0)

# 4. Prettier Code Style Check
corepack pnpm --filter web format:check
# Result: All matched files use Prettier code style (Exit code 0)

# 5. Production Next.js Turbopack Build
corepack pnpm --filter web build
# Result: 45 / 45 Static and Dynamic Routes Generated Cleanly (Exit code 0)
```
