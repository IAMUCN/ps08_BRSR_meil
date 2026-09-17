"""Turn evidence bytes into page images for OCR. Anything that can't be decoded is a permanent
failure."""

import cv2
import numpy as np
import pypdfium2 as pdfium

from worker.errors import UNREADABLE, PermanentError

# ponytail: only the first pages are read — bills/invoices are 1–3 pages; raise if multi-page
# evidence (e.g. registers) needs more. The page counts are recorded in raw_output.
MAX_PAGES = 10
PDF_RENDER_DPI = 200


def to_page_images(data: bytes, mime_type: str) -> tuple[list[np.ndarray], int]:
    """Returns (BGR page images, total page count)."""
    if mime_type == "application/pdf":
        try:
            pdf = pdfium.PdfDocument(data)
        except pdfium.PdfiumError as error:
            raise PermanentError(UNREADABLE) from error
        total = len(pdf)
        if total == 0:
            raise PermanentError(UNREADABLE)
        pages = []
        try:
            for index in range(min(total, MAX_PAGES)):
                rgb = np.array(pdf[index].render(scale=PDF_RENDER_DPI / 72).to_pil().convert("RGB"))
                pages.append(np.ascontiguousarray(rgb[:, :, ::-1]))  # RGB → BGR
        except pdfium.PdfiumError as error:
            raise PermanentError(UNREADABLE) from error
        finally:
            pdf.close()
        return pages, total

    if mime_type in ("image/jpeg", "image/png"):
        image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None or image.size == 0:
            raise PermanentError(UNREADABLE)
        return [image], 1

    raise PermanentError("This file type can't be processed — upload a PDF, JPG or PNG.")
