# Upload: document description and expected-submission progress
Date: 2026-11-11

## Intent
Let the uploader add a note to a document, and let them see on Upload which of the project's expected
submissions for the period are already in, so progress is visible while they work.

## Key decisions
- Decision: an optional description, at most 500 characters, stored on the document (migration `0063`, D53).
  Shown on Verify, the record panel, My Submissions and Submission Monitoring; searched; exported in CSV;
  changeable by the uploader until the record is approved or rejected; every change audited. Owner chose
  "shown everywhere". Alternatives: shown but fixed; stored and shown in the record panel only.
- Decision: a multi-bill PDF's description is copied to each bill cut out of it (the agent's choice).
- Decision: an expected submission counts as submitted as soon as a document for it is on file in the period,
  with the newest record's stage beside it; a rejected record does not count. Owner's choice over "only when
  approved" and "uploaded, no stage".
- Decision: the list shows every expected activity of the chosen project, other roles' too. Owner's choice over
  "only my activities". Only activity names, scopes and stages are shown, no names of people or values.
- Decision: the list follows the form's project and period, refreshes after each upload and every 20 seconds while
  the tab is visible (the agent's choice; "real-time" read as near-live, no websockets).
- Decision: only the unit's own expectations are listed, not those of units beneath it (an upload target is the
  unit the document is filed under).

## Surfaced assumptions
- The list is only as good as the expectations configured on Admin → Organization. On the local database on
  2026-11-11 only MSRTC e-bus order (2), BEST Mumbai e-buses (1) and Olectra Greentech (1) had any.

## Open questions
- Should the expectations be filled in for the demo projects (e.g. every activity their monthly test bills cover)?
