"""Failure classes (.grill/phase-2b-ocr-worker-decisions.md — failure handling)."""


class PermanentError(Exception):
    """Retrying won't help (unreadable file, no text). `str(error)` is shown to the user."""


class TransientError(Exception):
    """May succeed on a later attempt (storage, database, model runtime)."""


class LostClaim(Exception):
    """Another worker reclaimed this job (it looked stale); drop our result."""


UNREADABLE = "We couldn't read this file — it may be damaged. Upload a clearer copy."
NO_TEXT = "No readable text was found in this document — upload a clearer copy."
MISSING_FILE = "The original file is missing from storage — upload the document again."
NOT_LINKED = "This document isn't linked to an ESG record."
TOO_MANY_ATTEMPTS = (
    "We couldn't process this document after several attempts — try again later or contact support."
)
