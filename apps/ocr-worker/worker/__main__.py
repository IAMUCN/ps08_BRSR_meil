"""Run the OCR worker: `python -m worker` (poll forever) or `python -m worker --once` (drain and
exit)."""

import argparse
import signal
import time

import psycopg

from worker import db
from worker.config import load_settings
from worker.logs import capture, setup
from worker.ocr import MODEL_VERSION, OcrEngine
from worker.processor import process_next


def main() -> None:
    parser = argparse.ArgumentParser(description="TraceESG OCR worker")
    parser.add_argument("--once", action="store_true", help="process waiting jobs, then exit")
    args = parser.parse_args()

    settings = load_settings()
    log = setup(settings.sentry_dsn)
    log.info("loading OCR models", extra={"models": MODEL_VERSION})
    engine = OcrEngine(settings.model_path)  # warm before polling (TRD §23 step 7)
    log.info("worker ready", extra={"poll_interval_s": settings.poll_interval_seconds})

    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True
        log.info("stopping after the current job")

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    while not stopping:
        try:
            with db.connect(settings.database_url) as conn:
                while not stopping:
                    if process_next(conn, settings, engine):
                        continue
                    if args.once:
                        return
                    time.sleep(settings.poll_interval_seconds)
        except psycopg.OperationalError as error:
            # Database unreachable: a claimed job stays "processing" and is reclaimed later.
            capture(error)
            log.error("database unavailable", extra={"error": str(error)})
            if args.once:
                raise
            time.sleep(settings.poll_interval_seconds)


if __name__ == "__main__":
    main()
