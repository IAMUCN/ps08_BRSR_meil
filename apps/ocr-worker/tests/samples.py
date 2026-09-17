"""Synthetic sample documents, generated at test time (.grill/phase-2b-ocr-worker-decisions.md).

Every document is fictitious and watermarked SAMPLE — no real MEIL data (synthetic only until
Phase 18). Each sample carries the values drawn on it, so tests can assert extraction against
known truth.
"""

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

WIDTH, HEIGHT = 1240, 1754  # A4 at 150 DPI


@dataclass(frozen=True)
class Sample:
    name: str
    data: bytes
    mime_type: str
    metric_code: str
    expected: dict  # field_key → value, or {} when the job must fail
    document_type: str | None = None


def _font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.load_default(size=size)


def _page(draw_body) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(image)
    draw.text(
        (60, 40),
        "SAMPLE - SYNTHETIC TEST DOCUMENT - NOT A REAL INVOICE",
        fill=(150, 150, 150),
        font=_font(22),
    )
    draw_body(draw)
    return image


def _diesel_table(draw: ImageDraw.ImageDraw) -> None:
    big, body = _font(40), _font(28)
    draw.text((60, 110), "Northwind Fuels Pvt Ltd (fictitious)", fill="black", font=big)
    draw.text((60, 170), "TAX INVOICE", fill="black", font=big)
    draw.text((60, 260), "Invoice No: SMP-INV-2026-0042", fill="black", font=body)
    draw.text((60, 305), "Invoice Date: 05-Sep-2026", fill="black", font=body)
    draw.text((60, 350), "Bill To: Sample Project Site Office", fill="black", font=body)
    y = 460
    draw.line((60, y - 15, 1180, y - 15), fill="black", width=2)
    for x, text in ((60, "Description"), (560, "Qty (Ltr)"), (800, "Rate"), (980, "Amount")):
        draw.text((x, y), text, fill="black", font=body)
    draw.line((60, y + 45, 1180, y + 45), fill="black", width=2)
    y += 70
    for x, text in (
        (60, "High Speed Diesel (HSD)"),
        (560, "1,250.00"),
        (800, "92.50"),
        (980, "1,15,625.00"),
    ):
        draw.text((x, y), text, fill="black", font=body)
    draw.text((60, 700), "Due Date: 20-Sep-2026", fill="black", font=body)


def _electricity(draw: ImageDraw.ImageDraw) -> None:
    big, body = _font(40), _font(28)
    draw.text((60, 110), "Sample Power Distribution Co. (fictitious)", fill="black", font=big)
    draw.text((60, 170), "ELECTRICITY BILL", fill="black", font=big)
    rows = [
        ("Bill No:", "EB-839271"),
        ("Billing Period:", "01-Aug-2026 to 31-Aug-2026"),
        ("Meter No:", "MTR-55-1029"),
        ("Tariff:", "LT-II Commercial"),
        ("Previous Reading:", "10,200"),
        ("Current Reading:", "1,12,630"),
        ("Units Consumed:", "102,430 kWh"),
        ("Energy Charges:", "Rs 7,68,225.00"),
    ]
    for i, (label, value) in enumerate(rows):
        draw.text((60, 280 + i * 60), label, fill="black", font=body)
        draw.text((520, 280 + i * 60), value, fill="black", font=body)


def _diesel_simple(draw: ImageDraw.ImageDraw) -> None:
    big, body = _font(40), _font(30)
    draw.text((60, 110), "Contoso Diesel Depot (fictitious)", fill="black", font=big)
    draw.text((60, 170), "FUEL INVOICE", fill="black", font=big)
    draw.text((60, 270), "Invoice Number: CDD/2026/0917", fill="black", font=body)
    draw.text((60, 320), "Supply Period: 01-Aug-2026 to 31-Aug-2026", fill="black", font=body)
    draw.text((60, 420), "Product: High Speed Diesel", fill="black", font=body)
    draw.text((60, 470), "Quantity: 860.5 Litres", fill="black", font=body)


def _scan(image: Image.Image) -> Image.Image:
    """Make a clean page look scanned: slight rotation, blur and seeded sensor noise."""
    rotated = image.rotate(1.5, expand=False, fillcolor="white", resample=Image.BICUBIC)
    blurred = rotated.filter(ImageFilter.GaussianBlur(0.8))
    noise = np.random.default_rng(42).normal(0, 12, (HEIGHT, WIDTH, 3))
    return Image.fromarray(
        np.clip(np.asarray(blurred, dtype=np.float32) + noise, 0, 255).astype(np.uint8)
    )


def _encode(image: Image.Image, fmt: str, **options) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, **options)
    return buffer.getvalue()


DIESEL_EXPECTED = {
    "quantity": "1250.00",
    "unit": "Ltr",
    "invoice_number": "SMP-INV-2026-0042",
    "billing_period": "05-Sep-2026",
}


def all_samples() -> list[Sample]:
    return [
        Sample(
            "diesel_invoice_table.pdf",
            _encode(_page(_diesel_table), "PDF", resolution=150),
            "application/pdf",
            "DIESEL_CONSUMPTION",
            DIESEL_EXPECTED,
            "DIESEL_INVOICE",
        ),
        Sample(
            "electricity_bill.png",
            _encode(_page(_electricity), "PNG"),
            "image/png",
            "GRID_ELECTRICITY",
            {
                "consumption": "102430",
                "unit": "kWh",
                "billing_period": "01-Aug-2026 to 31-Aug-2026",
                "source_classification": None,
            },
            "ELECTRICITY_BILL",
        ),
        Sample(
            "diesel_invoice_scan.jpg",
            _encode(_scan(_page(_diesel_simple)), "JPEG", quality=70),
            "image/jpeg",
            "DIESEL_CONSUMPTION",
            {
                "quantity": "860.5",
                "unit": "Litres",
                "invoice_number": "CDD/2026/0917",
                "billing_period": "01-Aug-2026 to 31-Aug-2026",
            },
            "DIESEL_INVOICE",
        ),
    ]


def corrupted_pdf() -> bytes:
    """PDF header and trailer (passes the upload-time structure check) around an invalid body."""
    garbage = np.random.default_rng(7).integers(0, 256, 4096, dtype=np.uint8).tobytes()
    return b"%PDF-1.4\n" + garbage + b"\n%%EOF\n"


def blank_png() -> bytes:
    return _encode(Image.new("RGB", (800, 1000), "white"), "PNG")
