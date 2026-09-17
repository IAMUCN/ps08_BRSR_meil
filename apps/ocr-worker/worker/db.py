"""Postgres access for the job queue (TRD §11, schema §8, §20.4).

Every state change is one transaction that also writes its audit entries (Master Approach §31;
system events carry user_id = null). Result writes are guarded by the claim token (`started_at`),
so a job that another worker reclaimed as stale can't be written twice.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from worker.config import STALE_PROCESSING_MINUTES
from worker.errors import LostClaim
from worker.extraction.fields import ExtractedField, FieldSpec


@dataclass(frozen=True)
class ClaimedJob:
    id: UUID
    document_id: UUID
    retry_count: int
    started_at: datetime
    reclaimed: bool


@dataclass(frozen=True)
class JobContext:
    storage_path: str
    mime_type: str
    esg_record_id: UUID | None
    fields: list[FieldSpec]
    document_types: dict[str, UUID]  # code → id, types mapped to the record's metric


def connect(database_url: str) -> psycopg.Connection:
    return psycopg.connect(database_url, autocommit=True, row_factory=dict_row)


def claim_job(
    conn: psycopg.Connection, only_job_ids: list[UUID] | None = None
) -> ClaimedJob | None:
    """Claim the oldest pending job, or one stuck in processing (crashed worker), skipping locked
    rows."""
    with conn.transaction():
        row = conn.execute(
            """
            with candidate as (
              select j.id, j.status as previous_status
              from public.ocr_jobs j
              join public.documents d on d.id = j.document_id
              where (j.status = 'pending'
                     or (j.status = 'processing'
                         and j.started_at < now() - make_interval(mins => %(stale)s)))
                and d.deleted_at is null
                and (%(only)s::uuid[] is null or j.id = any(%(only)s::uuid[]))
              order by d.created_at
              limit 1
              for update of j skip locked
            )
            update public.ocr_jobs j
            set status = 'processing',
                started_at = clock_timestamp(),
                retry_count = case when candidate.previous_status = 'processing'
                                   then j.retry_count + 1 else j.retry_count end
            from candidate
            where j.id = candidate.id
            returning j.id, j.document_id, j.retry_count, j.started_at,
                      candidate.previous_status = 'processing' as reclaimed
            """,
            {"stale": STALE_PROCESSING_MINUTES, "only": only_job_ids},
        ).fetchone()
        if not row:
            return None
        conn.execute(
            "update public.documents set upload_status = 'processing' where id = %s",
            (row["document_id"],),
        )
    return ClaimedJob(**row)


def load_context(conn: psycopg.Connection, document_id: UUID) -> JobContext:
    doc = conn.execute(
        """
        select d.storage_path, d.mime_type, erd.esg_record_id, r.metric_id
        from public.documents d
        left join public.esg_record_documents erd on erd.document_id = d.id and erd.is_primary
        left join public.esg_records r on r.id = erd.esg_record_id
        where d.id = %s
        """,
        (document_id,),
    ).fetchone()
    fields, types = [], {}
    if doc["metric_id"]:
        fields = [
            FieldSpec(r["field_key"], r["field_label"], r["data_type"])
            for r in conn.execute(
                """
                select field_key, field_label, data_type::text from public.metric_field_requirements
                where metric_id = %s order by field_key
                """,
                (doc["metric_id"],),
            )
        ]
        types = {
            r["code"]: r["id"]
            for r in conn.execute(
                """
                select dt.code, dt.id from public.document_type_metric_mappings map
                join public.document_types dt on dt.id = map.document_type_id
                where map.metric_id = %s
                """,
                (doc["metric_id"],),
            )
        }
    return JobContext(doc["storage_path"], doc["mime_type"], doc["esg_record_id"], fields, types)


def _audit(conn, event_type: str, entity_type: str, entity_id, new_value: dict) -> None:
    conn.execute(
        """
        insert into public.audit_logs (event_type, entity_type, entity_id, user_id, new_value)
        values (%s, %s, %s, null, %s)
        """,
        (event_type, entity_type, entity_id, Jsonb(new_value)),
    )


def _finish_job(conn, job: ClaimedJob, status: str, model_version: str | None, error: str | None):
    updated = conn.execute(
        """
        update public.ocr_jobs
        set status = %s, completed_at = now(), model_version = coalesce(%s, model_version),
            error_message = %s
        where id = %s and status = 'processing' and started_at = %s
        returning id
        """,
        (status, model_version, error, job.id, job.started_at),
    ).fetchone()
    if not updated:
        raise LostClaim()


def complete_job(
    conn: psycopg.Connection,
    job: ClaimedJob,
    context: JobContext,
    model_version: str,
    document_type: str | None,
    fields: list[ExtractedField],
    raw_output: dict,
) -> UUID:
    with conn.transaction():
        _finish_job(conn, job, "completed", model_version, None)
        extraction_id = conn.execute(
            """
            insert into public.ocr_extractions (ocr_job_id, document_id, raw_output)
            values (%s, %s, %s) returning id
            """,
            (job.id, job.document_id, Jsonb(raw_output)),
        ).fetchone()["id"]
        for f in fields:
            field_id = conn.execute(
                """
                insert into public.ocr_fields
                  (ocr_extraction_id, field_key, field_label, extracted_value, confidence)
                values (%s, %s, %s, %s, %s) returning id
                """,
                (extraction_id, f.key, f.label, f.value, f.confidence),
            ).fetchone()["id"]
            _audit(
                conn,
                "ocr.field_extracted",
                "ocr_field",
                field_id,
                {"field_key": f.key, "extracted_value": f.value, "confidence": f.confidence},
            )
        conn.execute(
            """
            update public.documents
            set upload_status = 'ready', document_type_id = coalesce(%s, document_type_id)
            where id = %s
            """,
            (context.document_types.get(document_type), job.document_id),
        )
        # Only advance a record still waiting for OCR; never touch verified/validated state.
        conn.execute(
            """
            update public.esg_records set verification_status = 'ocr_completed'
            where id = %s and verification_status = 'document_uploaded'
            """,
            (context.esg_record_id,),
        )
        _audit(
            conn,
            "ocr.document_processed",
            "document",
            job.document_id,
            {
                "ocr_job_id": str(job.id),
                "ocr_extraction_id": str(extraction_id),
                "model_version": model_version,
                "document_type": document_type,
                "fields_found": sum(1 for f in fields if f.value is not None),
                "fields_missing": [f.key for f in fields if f.value is None],
                "attempt": job.retry_count + 1,
            },
        )
    return extraction_id


def fail_job(conn: psycopg.Connection, job: ClaimedJob, message: str) -> None:
    """Permanent failure: the user sees `message`; the record stays waiting for a replacement
    document."""
    with conn.transaction():
        _finish_job(conn, job, "failed", None, message)
        conn.execute(
            "update public.documents set upload_status = 'failed' where id = %s", (job.document_id,)
        )
        _audit(
            conn,
            "ocr.document_failed",
            "document",
            job.document_id,
            {"ocr_job_id": str(job.id), "error_message": message, "attempts": job.retry_count + 1},
        )


def requeue_job(conn: psycopg.Connection, job: ClaimedJob, message: str) -> None:
    """Transient failure: back to pending for another attempt."""
    with conn.transaction():
        updated = conn.execute(
            """
            update public.ocr_jobs
            set status = 'pending', started_at = null, retry_count = retry_count + 1,
                error_message = %s
            where id = %s and status = 'processing' and started_at = %s
            returning id
            """,
            (message, job.id, job.started_at),
        ).fetchone()
        if not updated:
            raise LostClaim()
        conn.execute(
            "update public.documents set upload_status = 'uploaded' where id = %s",
            (job.document_id,),
        )
