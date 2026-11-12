"""Complete OCR jobs without running OCR, for synthetic test data whose printed values are known.

    docker run --rm -i -e DATABASE_URL=... --entrypoint python \
        traceesg-ocr-worker:latest - < this file
    (the job list arrives as JSON in JOBS_JSON, or at the path in JOBS_FILE)

Used by apps/web/scripts/feed-monthly-data.mjs for the months it loads "directly":
the earlier months of the demonstration data, where running the OCR engine over
~1,000 pages is not worth the hours. The write is the worker's own `complete_job`
(same rows, same audit entries, same notification), so every later step sees an
ordinary extraction. Two things mark it: the model version is `direct-load (no OCR)`
and `raw_output` says `synthetic: true`. Confidence is 100 because the values are
the ones the document was generated from; it is not a recognition score.

Input: a JSON list of {"document_id", "document_type" (code), "fields": {field_key: value}}.
"""

import json
import os
import sys

sys.path.insert(0, "/app")

from worker import db  # noqa: E402
from worker.extraction.fields import ExtractedField  # noqa: E402

MODEL_VERSION = "direct-load (no OCR)"


def main() -> None:
    raw = os.environ.get("JOBS_JSON") or open(os.environ["JOBS_FILE"], encoding="utf-8").read()
    jobs = json.loads(raw)
    conn = db.connect(os.environ["DATABASE_URL"])
    done, skipped = 0, []
    for item in jobs:
        row = conn.execute(
            "select id from public.ocr_jobs where document_id = %s and status = 'pending'",
            (item["document_id"],),
        ).fetchone()
        if not row:
            skipped.append(item["document_id"])
            continue
        job = db.claim_job(conn, [row["id"]])
        if job is None:
            skipped.append(item["document_id"])
            continue
        context = db.load_context(conn, job.document_id)
        values = item["fields"]
        fields = [
            ExtractedField(
                spec.key,
                spec.label,
                values.get(spec.key),
                100.0 if values.get(spec.key) is not None else None,
                {"method": "direct_load"},
            )
            for spec in context.fields
        ]
        db.complete_job(
            conn,
            job,
            context,
            MODEL_VERSION,
            item.get("document_type"),
            fields,
            {
                "synthetic": True,
                "note": "Values loaded directly; the OCR engine was not run.",
                "lines": [],
            },
        )
        done += 1
    print(json.dumps({"completed": done, "skipped": skipped}))


if __name__ == "__main__":
    main()
