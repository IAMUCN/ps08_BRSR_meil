"""Worker settings from the environment (02_TRD.md §33). Values come from the process environment,
with an optional local `.env` file for development (never committed)."""

import os
from dataclasses import dataclass
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1]

# .grill/phase-2b-ocr-worker-decisions.md — failure handling
MAX_ATTEMPTS = 3
STALE_PROCESSING_MINUTES = 15


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    service_role_key: str
    evidence_bucket: str
    database_url: str
    model_path: Path
    poll_interval_seconds: float
    sentry_dsn: str


def _load_dotenv(path: Path) -> None:
    """Minimal KEY=VALUE loader; real environment variables always win."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def load_settings(require_services: bool = True) -> Settings:
    _load_dotenv(WORKER_ROOT / ".env")
    env = os.environ
    if require_services:
        missing = [
            name
            for name in (
                "NEXT_PUBLIC_SUPABASE_URL",
                "SUPABASE_SERVICE_ROLE_KEY",
                "SUPABASE_STORAGE_BUCKET_EVIDENCE",
                "DATABASE_URL",
            )
            if not env.get(name)
        ]
        if missing:
            raise RuntimeError(f"Missing environment variables: {', '.join(missing)}")
    return Settings(
        supabase_url=env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/"),
        service_role_key=env.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        evidence_bucket=env.get("SUPABASE_STORAGE_BUCKET_EVIDENCE", ""),
        database_url=env.get("DATABASE_URL", ""),
        model_path=Path(env.get("OCR_MODEL_PATH") or WORKER_ROOT / "models"),
        poll_interval_seconds=int(env.get("OCR_WORKER_POLL_INTERVAL_MS") or 5000) / 1000,
        sentry_dsn=env.get("SENTRY_DSN", ""),
    )
