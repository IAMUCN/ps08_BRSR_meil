# Changing the activity on Verify Extraction (2026-11-12)

Owner's request: "after submitting the one file which belongs to other category, in verify extraction page show
every option directly as it was being shown in the upload page. Also while flagging the bill suggest the user that
it may belong to that category, for example electricity bill uploaded in CNG consumption; then flag that as
category mismatch, and suggest the user that it may be an electricity bill, change the category to grid
electricity. And in the drop down give the user all the categories." A56.

## Decisions (made by the agent while building; confirm with the owner)

1. **Which activities are listed:** the Upload page's list for the record's project, for the person on the page
   (their roles, on-behalf uploads; Administrators every activity), keeping only activities that accept the file's
   type. The server refuses anything else. A suggested activity outside that list (another role's) is named, with
   "Reject this document so the right person uploads it".
2. **When:** only before Confirm (the document has been read, or its reading failed). Returned records keep the
   existing reviewer path (Return as wrong activity, re-upload).
3. **What a change does:** the record's activity changes; the OCR reading is discarded and the same job is queued
   again, so the worker reads the document for the new activity's fields (about 10 s a page). The discarded
   values are kept in the audit entry. No worker change. The document type is set when the new activity has only
   one; otherwise OCR or the person picks it.
4. **Failed reading:** the activity changes and the person types the new activity's values (manual exception, as
   before); the document is not read again.
5. **The suggestion** comes from the worker's existing mismatch check (a clear keyword margin, `detect_mismatch`);
   no new guessing. The reviewer's flag after Confirm keeps working and now says "Category mismatch: … It may
   belong to …".
6. No migration.
