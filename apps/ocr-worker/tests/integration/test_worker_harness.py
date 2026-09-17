"""Phase 2B standalone harness: seed documents + jobs directly (SQL + Storage), run the real
worker with real PaddleOCR, assert what it wrote. Needs local Supabase and downloaded models; does
not need apps/web.

    python -m unittest discover -s tests/integration -t .

Refuses to run against anything but a local database. Cleans up every row and object it creates.
"""

import dataclasses
import hashlib
import json
import unittest
import uuid
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from psycopg.types.json import Jsonb

from tests.samples import all_samples, blank_png, corrupted_pdf
from worker import db, errors
from worker.config import MAX_ATTEMPTS, load_settings
from worker.errors import LostClaim
from worker.ocr import MODEL_NAMES
from worker.processor import RETRYING, process_next

EXTENSIONS = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg"}


class WorkerHarnessTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.settings = load_settings()
        except RuntimeError as error:
            raise unittest.SkipTest(str(error)) from error
        if urlparse(cls.settings.database_url).hostname not in ("127.0.0.1", "localhost"):
            raise unittest.SkipTest("integration harness only runs against a local database")
        if not all((cls.settings.model_path / name).is_dir() for name in MODEL_NAMES):
            raise unittest.SkipTest("models not downloaded (scripts/download_models.py)")

        from worker.ocr import OcrEngine

        cls.engine = OcrEngine(cls.settings.model_path)
        cls.conn = db.connect(cls.settings.database_url)
        cls.user_id = uuid.uuid4()
        cls.created_documents: list[uuid.UUID] = []
        cls.conn.execute(
            "insert into auth.users (id, email, aud, role)"
            " values (%s, %s, 'authenticated', 'authenticated')",
            (cls.user_id, f"ocr-harness-{cls.user_id}@example.test"),
        )
        cls.conn.execute(
            "insert into public.users (id, display_name, email) values (%s, 'OCR Harness', %s)",
            (cls.user_id, f"ocr-harness-{cls.user_id}@example.test"),
        )
        cls.org_unit_id = cls.conn.execute(
            "select id from public.org_units where code = 'PRJ-X'"
        ).fetchone()["id"]
        cls.period_id = cls.conn.execute(
            "select id from public.reporting_periods order by (status = 'open') desc limit 1"
        ).fetchone()["id"]

    @classmethod
    def tearDownClass(cls):
        conn, docs = cls.conn, cls.created_documents
        rows = conn.execute(
            """
            select d.storage_path, erd.esg_record_id from public.documents d
            left join public.esg_record_documents erd on erd.document_id = d.id
            where d.id = any(%s)
            """,
            (docs,),
        ).fetchall()
        records = [r["esg_record_id"] for r in rows if r["esg_record_id"]]
        with conn.transaction():
            conn.execute(
                """
                delete from public.audit_logs where entity_id = any(%(docs)s) or entity_id in (
                  select f.id from public.ocr_fields f
                  join public.ocr_extractions e on e.id = f.ocr_extraction_id
                  where e.document_id = any(%(docs)s))
                """,
                {"docs": docs},
            )
            conn.execute(
                """
                delete from public.ocr_fields where ocr_extraction_id in (
                  select id from public.ocr_extractions where document_id = any(%s))
                """,
                (docs,),
            )
            conn.execute("delete from public.ocr_extractions where document_id = any(%s)", (docs,))
            conn.execute("delete from public.ocr_jobs where document_id = any(%s)", (docs,))
            conn.execute(
                "delete from public.esg_record_documents where document_id = any(%s)", (docs,)
            )
            conn.execute("delete from public.esg_records where id = any(%s)", (records,))
            conn.execute("delete from public.documents where id = any(%s)", (docs,))
            conn.execute("delete from public.notifications where user_id = %s", (cls.user_id,))
            conn.execute("delete from public.users where id = %s", (cls.user_id,))
            conn.execute("delete from auth.users where id = %s", (cls.user_id,))
        cls._storage_request(
            "DELETE",
            f"/storage/v1/object/{cls.settings.evidence_bucket}",
            json.dumps({"prefixes": [r["storage_path"] for r in rows]}).encode(),
            "application/json",
        )
        conn.close()

    # --- helpers ---------------------------------------------------------------------------------

    @classmethod
    def _storage_request(cls, method: str, path: str, body: bytes, content_type: str) -> None:
        key = cls.settings.service_role_key
        request = Request(
            f"{cls.settings.supabase_url}{path}",
            data=body,
            method=method,
            headers={"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": content_type},
        )
        with urlopen(request, timeout=60):
            pass

    def seed_job(self, data: bytes, mime_type: str, metric_code: str, upload: bool = True):
        document_id = uuid.uuid4()
        self.created_documents.append(document_id)
        path = f"{self.org_unit_id}/{self.period_id}/{document_id}/original.{EXTENSIONS[mime_type]}"
        if upload:
            self._storage_request(
                "POST",
                f"/storage/v1/object/{self.settings.evidence_bucket}/{path}",
                data,
                mime_type,
            )
        with self.conn.transaction():
            self.conn.execute(
                """
                insert into public.documents (id, org_unit_id, reporting_period_id, storage_path,
                  file_name, mime_type, file_size_bytes, file_hash, uploaded_by)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    document_id,
                    self.org_unit_id,
                    self.period_id,
                    path,
                    f"harness.{EXTENSIONS[mime_type]}",
                    mime_type,
                    len(data),
                    hashlib.sha256(data).hexdigest(),
                    self.user_id,
                ),
            )
            record_id = self.conn.execute(
                """
                insert into public.esg_records (org_unit_id, reporting_period_id, metric_id,
                  scope_id, submitted_by, verification_status, calculation_status)
                select %s, %s, m.id, m.scope_id, %s, 'document_uploaded', 'pending'
                from public.esg_metrics m where m.code = %s
                returning id
                """,
                (self.org_unit_id, self.period_id, self.user_id, metric_code),
            ).fetchone()["id"]
            self.conn.execute(
                """
                insert into public.esg_record_documents
                  (esg_record_id, document_id, is_primary, added_by)
                values (%s, %s, true, %s)
                """,
                (record_id, document_id, self.user_id),
            )
            job_id = self.conn.execute(
                "insert into public.ocr_jobs (document_id) values (%s) returning id", (document_id,)
            ).fetchone()["id"]
        return document_id, record_id, job_id

    def job(self, job_id):
        return self.conn.execute(
            "select * from public.ocr_jobs where id = %s", (job_id,)
        ).fetchone()

    def document(self, document_id):
        return self.conn.execute(
            """
            select d.upload_status, dt.code as document_type from public.documents d
            left join public.document_types dt on dt.id = d.document_type_id where d.id = %s
            """,
            (document_id,),
        ).fetchone()

    def record(self, record_id):
        return self.conn.execute(
            "select * from public.esg_records where id = %s", (record_id,)
        ).fetchone()

    def audit_count(self, event_type: str, entity_ids) -> int:
        return self.conn.execute(
            "select count(*) as n from public.audit_logs"
            " where event_type = %s and entity_id = any(%s)",
            (event_type, list(entity_ids)),
        ).fetchone()["n"]

    def notifications(self, document_id):
        return self.conn.execute(
            """
            select user_id, type, title, message, related_entity_type, deep_link_path, is_read
            from public.notifications where related_entity_id = %s
            """,
            (document_id,),
        ).fetchall()

    def run_job(self, job_id, settings=None) -> bool:
        return process_next(
            self.conn, settings or self.settings, self.engine, only_job_ids=[job_id]
        )

    # --- tests -----------------------------------------------------------------------------------

    def test_synthetic_documents_extract_known_values(self):
        for sample in all_samples():
            with self.subTest(sample.name):
                document_id, record_id, job_id = self.seed_job(
                    sample.data, sample.mime_type, sample.metric_code
                )
                self.assertTrue(self.run_job(job_id))

                job = self.job(job_id)
                self.assertEqual(job["status"], "completed", job["error_message"])
                self.assertIn("rules-", job["model_version"])
                self.assertIsNone(job["error_message"])

                extraction = self.conn.execute(
                    "select id, raw_output from public.ocr_extractions where ocr_job_id = %s",
                    (job_id,),
                ).fetchone()
                self.assertGreater(len(extraction["raw_output"]["lines"]), 0)
                self.assertEqual(
                    extraction["raw_output"]["classification"]["document_type"],
                    sample.document_type,
                )

                fields = {
                    f["field_key"]: f
                    for f in self.conn.execute(
                        "select * from public.ocr_fields where ocr_extraction_id = %s",
                        (extraction["id"],),
                    )
                }
                self.assertEqual(
                    {k: f["extracted_value"] for k, f in fields.items()}, sample.expected
                )
                for f in fields.values():
                    if f["extracted_value"] is None:
                        self.assertIsNone(f["confidence"])
                    else:
                        self.assertTrue(50 <= float(f["confidence"]) <= 100, f)
                    # Extraction only: nothing is verified by the worker.
                    self.assertEqual(f["verification_status"], "pending")
                    self.assertIsNone(f["verified_value"])

                self.assertEqual(
                    dict(self.document(document_id)),
                    {"upload_status": "ready", "document_type": sample.document_type},
                )
                record = self.record(record_id)
                self.assertEqual(record["verification_status"], "ocr_completed")
                self.assertEqual(
                    (
                        record["validation_status"],
                        record["approval_status"],
                        record["calculation_status"],
                    ),
                    ("pending", "not_submitted", "pending"),
                )
                self.assertIsNone(record["activity_value_raw"])
                self.assertIsNone(record["verified_by"])

                self.assertEqual(self.audit_count("ocr.document_processed", [document_id]), 1)
                (note,) = self.notifications(document_id)
                self.assertIn(note["type"], ("verification_needed", "low_confidence"))
                self.assertEqual(
                    (note["user_id"], note["related_entity_type"], note["deep_link_path"]),
                    (self.user_id, "document", f"/app/verify/{document_id}"),
                )
                self.assertTrue(note["message"].startswith("harness."))
                self.assertFalse(note["is_read"])
                field_ids = [f["id"] for f in fields.values()]
                self.assertEqual(self.audit_count("ocr.field_extracted", field_ids), len(fields))

    def test_corrupted_pdf_fails_with_reason(self):
        document_id, record_id, job_id = self.seed_job(
            corrupted_pdf(), "application/pdf", "DIESEL_CONSUMPTION"
        )
        self.run_job(job_id)
        job = self.job(job_id)
        self.assertEqual((job["status"], job["error_message"]), ("failed", errors.UNREADABLE))
        self.assertEqual(self.document(document_id)["upload_status"], "failed")
        self.assertEqual(self.record(record_id)["verification_status"], "document_uploaded")
        self.assertIsNone(
            self.conn.execute(
                "select 1 from public.ocr_extractions where ocr_job_id = %s", (job_id,)
            ).fetchone()
        )
        self.assertEqual(self.audit_count("ocr.document_failed", [document_id]), 1)
        (note,) = self.notifications(document_id)
        self.assertEqual(
            (note["type"], note["title"], note["message"]),
            ("ocr_failed", "Extraction failed", f"harness.pdf: {errors.UNREADABLE}"),
        )

    def test_threshold_decides_the_notification_type(self):
        sample = all_samples()[0]  # diesel PDF: every field found at ~95%
        previous = self.conn.execute(
            "select value from public.org_settings where key = 'ocr_confidence_threshold'"
        ).fetchone()["value"]
        try:
            for threshold, expected in ((50, "verification_needed"), (99.99, "low_confidence")):
                self.conn.execute(
                    "update public.org_settings set value = %s"
                    " where key = 'ocr_confidence_threshold'",
                    (Jsonb(threshold),),
                )
                document_id, _, job_id = self.seed_job(
                    sample.data, sample.mime_type, sample.metric_code
                )
                self.run_job(job_id)
                (note,) = self.notifications(document_id)
                self.assertEqual(note["type"], expected)
                if expected == "low_confidence":
                    self.assertEqual(
                        note["message"],
                        "harness.pdf: 4 fields need your attention before you confirm.",
                    )
        finally:
            self.conn.execute(
                "update public.org_settings set value = %s where key = 'ocr_confidence_threshold'",
                (Jsonb(previous),),
            )

    def test_blank_page_fails_as_no_text(self):
        _, _, job_id = self.seed_job(blank_png(), "image/png", "GRID_ELECTRICITY")
        self.run_job(job_id)
        job = self.job(job_id)
        self.assertEqual((job["status"], job["error_message"]), ("failed", errors.NO_TEXT))

    def test_missing_storage_object_fails(self):
        _, _, job_id = self.seed_job(blank_png(), "image/png", "GRID_ELECTRICITY", upload=False)
        self.run_job(job_id)
        job = self.job(job_id)
        self.assertEqual((job["status"], job["error_message"]), ("failed", errors.MISSING_FILE))

    def test_transient_errors_retry_then_fail(self):
        document_id, _, job_id = self.seed_job(
            all_samples()[0].data, "application/pdf", "DIESEL_CONSUMPTION"
        )
        storage_down = dataclasses.replace(self.settings, supabase_url="http://127.0.0.1:9")
        for attempt in range(1, MAX_ATTEMPTS):
            self.run_job(job_id, storage_down)
            job = self.job(job_id)
            self.assertEqual(
                (job["status"], job["retry_count"], job["error_message"]),
                ("pending", attempt, RETRYING),
            )
            self.assertIsNone(job["started_at"])
            self.assertEqual(self.document(document_id)["upload_status"], "uploaded")
        self.run_job(job_id, storage_down)
        job = self.job(job_id)
        self.assertEqual(
            (job["status"], job["error_message"]), ("failed", errors.TOO_MANY_ATTEMPTS)
        )

    def test_stale_processing_job_is_reclaimed_but_a_live_one_is_not(self):
        _, _, stale_id = self.seed_job(all_samples()[2].data, "image/jpeg", "DIESEL_CONSUMPTION")
        _, _, live_id = self.seed_job(all_samples()[2].data, "image/jpeg", "DIESEL_CONSUMPTION")
        mark_processing = (
            "update public.ocr_jobs set status = 'processing',"
            " started_at = now() - %s::interval where id = %s"
        )
        self.conn.execute(mark_processing, ("20 minutes", stale_id))
        self.conn.execute(mark_processing, ("1 minute", live_id))
        self.assertFalse(
            self.run_job(live_id), "a job processed within 15 minutes must not be reclaimed"
        )
        self.assertTrue(self.run_job(stale_id))
        job = self.job(stale_id)
        self.assertEqual((job["status"], job["retry_count"]), ("completed", 1))

    def test_concurrent_workers_never_claim_the_same_job(self):
        _, _, first = self.seed_job(blank_png(), "image/png", "GRID_ELECTRICITY")
        _, _, second = self.seed_job(blank_png(), "image/png", "GRID_ELECTRICITY")
        other = db.connect(self.settings.database_url)
        try:
            with other.transaction():
                other.execute("select id from public.ocr_jobs where id = %s for update", (first,))
                claimed = db.claim_job(self.conn, [first, second])
                self.assertEqual(claimed.id, second)
        finally:
            other.close()
        db.fail_job(self.conn, claimed, "harness cleanup")

    def test_result_is_dropped_when_another_worker_reclaimed_the_job(self):
        document_id, _, job_id = self.seed_job(blank_png(), "image/png", "GRID_ELECTRICITY")
        claimed = db.claim_job(self.conn, [job_id])
        self.conn.execute("update public.ocr_jobs set started_at = now() where id = %s", (job_id,))
        with self.assertRaises(LostClaim):
            db.fail_job(self.conn, claimed, "should not be written")
        self.assertEqual(self.job(job_id)["status"], "processing")
        self.assertEqual(self.audit_count("ocr.document_failed", [document_id]), 0)
        self.assertEqual(self.notifications(document_id), [])


if __name__ == "__main__":
    unittest.main()
