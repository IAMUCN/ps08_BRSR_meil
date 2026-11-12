"""Structured JSON logging (TRD §18) and Sentry error tracking (TRD §19)."""

import json
import logging
import sys
from datetime import UTC, datetime

_STANDARD = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Anything passed via `extra=` (job_id, duration_ms, ...) becomes a top-level key.
        entry.update({k: v for k, v in vars(record).items() if k not in _STANDARD})
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def setup(sentry_dsn: str) -> logging.Logger:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
    if sentry_dsn:
        import sentry_sdk

        # An error report carries the error and where it happened, nothing a document or a
        # setting held: by default the SDK also sends each stack frame's local variables, which
        # here can be the text read from an uploaded document or the database address.
        sentry_sdk.init(
            dsn=sentry_dsn,
            send_default_pii=False,
            include_local_variables=False,
            max_request_body_size="never",
        )
    return logging.getLogger("ocr_worker")


def capture(error: BaseException) -> None:
    """Report to Sentry when configured (sentry_sdk is a no-op before init)."""
    import sentry_sdk

    sentry_sdk.capture_exception(error)
