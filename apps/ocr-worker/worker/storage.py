"""Download evidence bytes from the private bucket with the service role (TRD §22). The key never
leaves this process."""

from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from worker.config import Settings
from worker.errors import MISSING_FILE, PermanentError, TransientError


def download(settings: Settings, storage_path: str) -> bytes:
    bucket, path = settings.evidence_bucket, quote(storage_path)
    url = f"{settings.supabase_url}/storage/v1/object/{bucket}/{path}"
    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {settings.service_role_key}",
            "apikey": settings.service_role_key,
        },
    )
    try:
        with urlopen(request, timeout=60) as response:
            return response.read()
    except HTTPError as error:
        # Supabase Storage answers a missing object with 400 or 404.
        if error.code in (400, 404):
            raise PermanentError(MISSING_FILE) from error
        raise TransientError(f"storage download failed: HTTP {error.code}") from error
    except (URLError, TimeoutError, ConnectionError) as error:
        raise TransientError(f"storage download failed: {error}") from error
