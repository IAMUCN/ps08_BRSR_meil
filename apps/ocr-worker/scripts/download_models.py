"""Download the pinned PaddleOCR model weights from the Hugging Face Hub into OCR_MODEL_PATH.

Run once per machine (and at image build time in Phase 6, TRD §35) — the worker itself never
downloads models at runtime.

    python scripts/download_models.py
"""

import sys
from pathlib import Path

from huggingface_hub import snapshot_download

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.config import load_settings  # noqa: E402
from worker.ocr import MODEL_NAMES  # noqa: E402


def main() -> None:
    settings = load_settings(require_services=False)
    for name in MODEL_NAMES:
        target = settings.model_path / name
        print(f"Downloading PaddlePaddle/{name} -> {target}")
        snapshot_download(repo_id=f"PaddlePaddle/{name}", local_dir=target)
    print("Done.")


if __name__ == "__main__":
    main()
