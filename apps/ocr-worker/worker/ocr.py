"""PaddleOCR engine (TRD §10): PP-OCRv5 mobile detection + English mobile recognition, CPU, loaded
once and kept warm. Weights must already be in OCR_MODEL_PATH (scripts/download_models.py)."""

import os
from pathlib import Path

from worker.extraction.fields import TextLine

MODEL_NAMES = ("PP-OCRv5_mobile_det", "en_PP-OCRv5_mobile_rec")
MODEL_VERSION = "+".join(MODEL_NAMES)
DET_MAX_SIDE = 1600


class OcrEngine:
    def __init__(self, model_path: Path):
        missing = [name for name in MODEL_NAMES if not (model_path / name).is_dir()]
        if missing:
            raise RuntimeError(
                f"OCR model weights not found in {model_path}: {', '.join(missing)}. "
                "Run scripts/download_models.py first."
            )
        # Never reach out to a model hoster at runtime (TRD §35).
        os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
        from paddleocr import PaddleOCR

        det, rec = MODEL_NAMES
        self._ocr = PaddleOCR(
            text_detection_model_name=det,
            text_detection_model_dir=str(model_path / det),
            text_recognition_model_name=rec,
            text_recognition_model_dir=str(model_path / rec),
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            device="cpu",
            # paddlepaddle 3.3.1's oneDNN path fails on these models
            # ("ConvertPirAttribute2RuntimeAttribute not support"); plain CPU inference works.
            # Revisit when upgrading paddlepaddle.
            enable_mkldnn=False,
            # Cap the detector input (longest side) to bound memory and CPU time per page; A4 pages
            # at this size still keep invoice-sized text legible.
            text_det_limit_type="max",
            text_det_limit_side_len=DET_MAX_SIDE,
        )

    def read(self, pages: list) -> list[TextLine]:
        """OCR each page image (BGR numpy array) into text lines with recognition confidence."""
        lines: list[TextLine] = []
        for page_number, image in enumerate(pages, start=1):
            for result in self._ocr.predict(image):
                for text, score, box in zip(
                    result["rec_texts"], result["rec_scores"], result["rec_boxes"], strict=True
                ):
                    x0, y0, x1, y1 = (float(v) for v in box)
                    lines.append(TextLine(str(text), float(score), (x0, y0, x1, y1), page_number))
        return lines
