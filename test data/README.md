# Test data, April 2025 to October 2026

One folder per month, named like `April 2025`. Everything is fictitious and watermarked SAMPLE (org units
are MEIL's published business units and projects; every figure, vendor and person is invented).

| Months | Status |
|---|---|
| April 2025 to March 2026 (FY 2025-26) | Fed into the app |
| April 2026 to September 2026 | Fed into the app |
| **October 2026** | **Generated only, not fed.** The reporting period "October 2026" exists and is open; upload these files in front of the jury. |

## What is in a month folder

- `documents/<org unit>/<role>/` one bill per ESG activity for three projects (MSRTC e-bus order, BEST Mumbai
  e-buses, Seetharampur plant), filed by the role that uploads it. In each role's folder a third are single PDFs,
  a third images (JPG and PNG in turn) and the rest are pages of one `multi-bill (N bills).pdf`
  (upload it with "A PDF with several bills"). TGSRTC has only a 3-bill PDF.
- `manifest.csv` which file goes where (period, org unit, role, activity, document type) and the values printed on it.
- `bills.json` the same, one entry per bill, with the field values the verify screen should hold. Read by
  `apps/web/scripts/feed-monthly-data.mjs`.
- `_feed/<month>/` the bills of every multi-bill PDF as one-page PDFs, used only by the feeding script.

Quantities follow a gentle seasonal curve (`MONTHS` in `apps/ocr-worker/scripts/make_monthly_data.py`), so
charts have a shape and no month trips the anomaly check.

## How the months were fed

Every bill went in as its own document through the app's own procedures, by the account that owns it (one
account per role and unit, plus one Corporate ESG account that approves). The people confirmed the values printed on the bill.
- **July, August and September 2026**: real OCR read every document.
- **All earlier months**: the OCR engine was not run. The values were loaded directly through the worker's own
  write path (`apps/ocr-worker/scripts/synthetic_extraction.py`); their extraction is marked
  `direct-load (no OCR)` with confidence 100. The rest of the pipeline (verify, validate, calculate, approve) ran normally.
- Six activities have no conversion factor (spend-based travel, freight and commuting, PNG, purchased steam,
  heat / cooling), so their records stay "awaiting approval, not calculated" in every month. That is by design;
  enter factors in Admin to calculate them.

## Accounts

Accounts are `<role>.<unit>@emeilsg.test` (and `corporate-esg.meil@emeilsg.test`, the approver), on both
the local database and hosted Supabase. Passwords are random and kept only in `_backup/` (git-ignored):
`feed-accounts.local.json` and `feed-accounts.hosted.json`.

## Regenerating

    python apps/ocr-worker/scripts/make_monthly_data.py --out "test data" --feed "test data/_feed"
    node apps/web/scripts/feed-monthly-data.mjs prepare|feed|close --env <env file> --app <url> --creds <file> ...

Needs `pypdfium2`, `pillow` and `numpy`. Delete a month's folder first if you change the generator and have
already fed it: the same bill twice is flagged as a duplicate.
