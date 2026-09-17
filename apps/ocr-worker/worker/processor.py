"""One job, end to end: claim → download → OCR → classify → extract → record (TRD §23)."""

import logging
import time
from uuid import UUID

import psycopg

from worker import db, files, storage
from worker.config import MAX_ATTEMPTS, Settings
from worker.errors import (
    NO_TEXT,
    NOT_LINKED,
    TOO_MANY_ATTEMPTS,
    LostClaim,
    PermanentError,
    TransientError,
)
from worker.extraction.fields import classify, extract_fields
from worker.extraction.profiles import EXTRACTOR_VERSION
from worker.logs import capture
from worker.ocr import MODEL_VERSION

log = logging.getLogger("ocr_worker")

RETRYING = "Processing was interrupted — it will be retried automatically."
# Lines recognised below this confidence don't count as "readable text".
MIN_READABLE_SCORE = 0.5
JOB_MODEL_VERSION = f"{MODEL_VERSION};{EXTRACTOR_VERSION}"


def process_next(
    conn: psycopg.Connection, settings: Settings, engine, only_job_ids: list[UUID] | None = None
) -> bool:
    """Process one job if any is waiting. Returns False when the queue is empty."""
    job = db.claim_job(conn, only_job_ids)
    if not job:
        return False
    context = {
        "job_id": str(job.id),
        "document_id": str(job.document_id),
        "attempt": job.retry_count + 1,
    }
    started = time.monotonic()

    try:
        if job.reclaimed and job.retry_count >= MAX_ATTEMPTS:
            raise PermanentError(TOO_MANY_ATTEMPTS)
        job_context = db.load_context(conn, job.document_id)
        if not job_context.esg_record_id:
            raise PermanentError(NOT_LINKED)

        data = storage.download(settings, job_context.storage_path)
        pages, total_pages = files.to_page_images(data, job_context.mime_type)
        try:
            lines = engine.read(pages)
        except Exception as error:
            raise TransientError(f"OCR engine error: {error}") from error
        if not any(line.text.strip() and line.score >= MIN_READABLE_SCORE for line in lines):
            raise PermanentError(NO_TEXT)

        document_type, type_scores = classify(lines, job_context.document_types)
        fields = extract_fields(lines, job_context.fields)
        raw_output = {
            "engine": {"models": MODEL_VERSION, "extractor": EXTRACTOR_VERSION},
            "pages": {"total": total_pages, "processed": len(pages)},
            "lines": [
                {"page": ln.page, "text": ln.text, "score": round(ln.score, 4), "box": ln.box}
                for ln in lines
            ],
            "classification": {"document_type": document_type, "scores": type_scores},
            "fields": {f.key: f.source for f in fields},
        }
        db.complete_job(
            conn, job, job_context, JOB_MODEL_VERSION, document_type, fields, raw_output
        )
        log.info(
            "job completed",
            extra={
                **context,
                "outcome": "completed",
                "document_type": document_type,
                "fields_found": sum(1 for f in fields if f.value is not None),
                "fields_total": len(fields),
                "duration_ms": round((time.monotonic() - started) * 1000),
            },
        )
    except PermanentError as error:
        message = str(error)
        _record(lambda: db.fail_job(conn, job, message), context, "failed", message)
    except LostClaim:
        log.warning("claim lost to another worker; result dropped", extra=context)
    except Exception as error:  # TransientError and anything unexpected
        capture(error)
        if job.retry_count + 1 >= MAX_ATTEMPTS:
            _record(
                lambda: db.fail_job(conn, job, TOO_MANY_ATTEMPTS), context, "failed", repr(error)
            )
        else:
            _record(lambda: db.requeue_job(conn, job, RETRYING), context, "requeued", repr(error))
    return True


def _record(write, context: dict, outcome: str, reason: str) -> None:
    try:
        write()
        log.warning(f"job {outcome}", extra={**context, "outcome": outcome, "reason": reason})
    except LostClaim:
        log.warning("claim lost to another worker; failure not recorded", extra=context)
