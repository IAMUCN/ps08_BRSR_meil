# Grill: 03_APP_FLOW.md UX/navigation decisions
Date: 2026-09-16

## Intent
Produce `03_APP_FLOW.md` — a complete page inventory, navigation spec, and set of user journeys/flows for the PS-08 evidence-first ESG/BRSR platform, consistent with `Master_Approach.md`, `01_PRD.md`, and `02_TRD.md`, resolving the UX-level decisions those documents leave open.

## Constraints
- Must not contradict the async OCR architecture already locked in `02_TRD.md` (Postgres-backed job queue, Python worker polling).
- Must not introduce pages beyond the given inventory merely to pad it out.
- MVP scope only for page/flow specs; explicitly defer field/mobile capture to future scope rather than designing for it now.

## Key decisions
- Decision: OCR processing is non-blocking/async in the UI — no dedicated "watch it process" wait screen. Reason: matches the TRD's async backend (PaddleOCR worker polling a job table, real multi-second-plus latency on CPU); a blocking wizard-style wait would fight the architecture and expose raw processing latency to the user. Alternative considered: a linear blocking wizard (`Upload → Upload Progress → OCR Processing → Extraction Result` as literal sequential full-page waits) — rejected; user uploads and is returned to their dashboard/list with a `Processing` status, notified when ready.
- Decision: Clicking a notification for a document ready for verification deep-links directly to `/verify/[documentId]`, not to a general list. Reason: avoids reintroducing friction ("you have work" nudges that don't point at the specific record) into an otherwise streamlined async flow.
- Decision: MVP upload is desktop drag-and-drop only (standard file picker); mobile/field camera capture is explicitly out of scope for this document's page specs, flagged as future work. Reason: user confirmed field capture is a real future need but not required now — avoids over-designing responsive/camera-capture UX prematurely.
- Decision: Reporting period is auto-assumed from the current open period (no manual picker before upload) and shown as an editable/correctable field during verification, sourced from OCR where possible. If no reporting period is open, the category-selection step shows a blocking empty state rather than allowing upload into an undefined period. Reason: minimizes upfront friction in the common case while still surfacing period as something the user actively confirms, matching the platform's "verify, don't blindly trust" principle.
- Decision: A real human approval step exists after validation, performed by Corporate ESG/Sustainability (with Admin also able to approve) — not by the submitter's own role. Reason: gives the Corporate ESG/Sustainability persona (vaguest role in the PRD) a concrete job, and enforces a real trust boundary (submitter ≠ approver) consistent with `Master_Approach.md`'s `Validated → Review_Pending → Approved` states. Alternative considered: validation-passing alone counts as final, no separate human approval — rejected as too weak a control for a BRSR-reportable value.

## Surfaced assumptions
- The literal linear flow diagram in the request brief (`Upload → Upload Progress → OCR Processing → Extraction Result`) read as a blocking wizard on first pass, but actually just describes the *logical* stages a document passes through — not that the user must watch each one happen in real time. Clarified before building the page inventory around the wrong mental model.
- "Notifications" in the brief could have meant a generic activity feed; clarified it must support deep-linking to a specific record, not just a general nudge.

## Out of scope
- Mobile-responsive camera-capture upload UX (future/P2, per prior TRD-stage and this session's confirmation).
- Manual reporting-period selection UI (not building a period picker on the upload path).
- Duplicate-detection surfacing timing was not separately grilled — designed per `Master_Approach.md` §41 guidance (flag for review, never silently discard) without needing further user input, since that source document already specifies the behavior.
