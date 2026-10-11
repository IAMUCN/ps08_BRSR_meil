# Test data for a full run-through of TraceESG

Two sets. Everything in them is **fictitious** and every document is watermarked SAMPLE. The org unit names are
MEIL's published business units, group companies and landmark projects (meil.in); every figure, vendor and
person is invented.

| | `test data 1` | `test data 2` |
|---|---|---|
| Reporting period | August 2026 | September 2026 |
| Org units to import | Irrigation, Transportation and Power with their projects (12) | Drinking Water, Hydrocarbons, Manufacturing and five group companies (11) |
| Documents | 63 single documents + 1 multi-bill PDF | 79 single documents + 1 multi-bill PDF |
| Who uploads | Polavaram, Zojila, Tuticorin; Gayathri Pump House (multi-bill) | the same four again (next month, about 7% higher) plus Uddanam and the Olectra plant |

Set 2 repeats set 1's projects one month later, so comparisons, trends and the chatbot's "this month against last
month" have two months to work with.

## What is already on the site (done on 2026-10-11)

- The old test data was cleared. A copy of every deleted row is in `_backup/`.
- **BRSR Disclosures**, financial year 2026-27: 23 answers about MEIL, each naming its source. The exact text is in
  `admin answers entered (MEIL, from meil.in).json`. Questions the website does not answer are empty.
- **Reports → inputs**, financial year 2022-23: turnover Rs 25,837.68 crore (the latest published annual return).
- **Conversion Factors**: the 29 factors in `conversion factors to enter.csv`, each with its source.

## What you do, in order

1. **Reporting periods** (Admin → Reporting Periods): create *August 2026* (1–31 Aug 2026) and *September 2026*
   (1–30 Sep 2026) and open them.
2. **Org units** (Admin → Organization → bulk import): choose **MEIL** under "Add under", then upload
   `test data 1/1 Org units - bulk import.xlsx`. Do the same later with set 2's sheet.
3. **Users** (Admin → Users → Bulk import): open `2 Employees - bulk import (add emails).xlsx`, type an email
   address in every row of the **Email** column, save, upload. Import the org units first: the sheet names them.
4. **Upload the documents.** `manifest.csv` lists every file: the org unit, the role that uploads it, the ESG
   activity to pick, and the values printed on it (to compare with what OCR reads). The folders follow the same
   order: `documents/<org unit code>/<role>/`.
5. **Verify, approve, report** as usual. The Corporate ESG account in the sheet (or the Admin) approves.

## Things built in on purpose

- `PRJ-POLAVARAM/HR/… WORKFORCE_GENDER.pdf` has a faint **Men** figure. OCR reads it with low confidence and may
  read it wrong; the verify screen makes the person check it. The right value is in the manifest.
- `PRJ-GAYATHRI/Project Manager/multi-bill (3 bills in one PDF).pdf`: pick "A PDF with several bills" on Upload.
- PNG, purchased steam, purchased heat / cooling, waste and the three spend-based activities have **no
  conversion factor** (no published source). Their records show "Not calculated yet"; that is expected.
- Air emissions, water, safety, workforce, procurement, CSR and fines need no factor.

## Making the files again

    cd apps/ocr-worker
    PYTHONPATH=. .venv/Scripts/python.exe scripts/make_test_data.py --out "../../test data"
    cd ../.. && node apps/web/scripts/test-data-sheets.mjs "test data"
