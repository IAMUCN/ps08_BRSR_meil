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


SMUDGE_SEED = 5  # chosen so the smudged value still reads correctly, well below 80 %
DEFAULT_INVOICE = "SMP-INV-2026-0042"


def _diesel_table(draw: ImageDraw.ImageDraw, invoice_number: str = DEFAULT_INVOICE) -> None:
    big, body = _font(40), _font(28)
    draw.text((60, 110), "Northwind Fuels Pvt Ltd (fictitious)", fill="black", font=big)
    draw.text((60, 170), "TAX INVOICE", fill="black", font=big)
    draw.text((60, 260), f"Invoice No: {invoice_number}", fill="black", font=body)
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


DEFAULT_BILL = "EB-839271"
DEFAULT_BILL_PERIOD = "01-Aug-2026 to 31-Aug-2026"


def _electricity(
    draw: ImageDraw.ImageDraw,
    bill_number: str = DEFAULT_BILL,
    billing_period: str = DEFAULT_BILL_PERIOD,
) -> None:
    big, body = _font(40), _font(28)
    draw.text((60, 110), "Sample Power Distribution Co. (fictitious)", fill="black", font=big)
    draw.text((60, 170), "ELECTRICITY BILL", fill="black", font=big)
    rows = [
        ("Bill No:", bill_number),
        ("Billing Period:", billing_period),
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
    "invoice_number": DEFAULT_INVOICE,
    "billing_period": "05-Sep-2026",
}


def diesel_invoice_pdf(invoice_number: str = DEFAULT_INVOICE) -> bytes:
    """The table-layout diesel invoice with a chosen invoice number (manual testing: each upload can
    carry its own number, so the duplicate-invoice path is only exercised on purpose)."""
    return _encode(_page(lambda draw: _diesel_table(draw, invoice_number)), "PDF", resolution=150)


def electricity_bill_pdf(
    bill_number: str = DEFAULT_BILL, billing_period: str = DEFAULT_BILL_PERIOD
) -> bytes:
    """An electricity bill as a PDF, for manual and end-to-end testing of Scope 2. The sample suite
    below keeps using the PNG version the OCR harness was built against."""
    return _encode(
        _page(lambda draw: _electricity(draw, bill_number, billing_period)),
        "PDF",
        resolution=150,
    )


def _waste(draw: ImageDraw.ImageDraw, certificate: str, disposal_date: str) -> None:
    big, body = _font(40), _font(28)
    draw.text((60, 110), "Sample Waste Handlers Pvt Ltd (fictitious)", fill="black", font=big)
    draw.text((60, 170), "WASTE DISPOSAL CERTIFICATE", fill="black", font=big)
    rows = [
        ("Certificate No:", certificate),
        ("Disposal Date:", disposal_date),
        ("Waste Type:", "Construction debris (non-hazardous)"),
        ("Treatment Route:", "Landfill"),
        ("Quantity:", "2,500.00"),
        ("Unit of Measure:", "kg"),
        ("Authorisation No:", "SPCB/2026/SAMPLE"),
    ]
    for i, (label, value) in enumerate(rows):
        draw.text((60, 280 + i * 60), label, fill="black", font=body)
        draw.text((560, 280 + i * 60), value, fill="black", font=body)


def _travel(draw: ImageDraw.ImageDraw, invoice: str, invoice_date: str) -> None:
    big, body = _font(40), _font(28)
    draw.text((60, 110), "Sample Travel Desk (fictitious)", fill="black", font=big)
    draw.text((60, 170), "TRAVEL INVOICE", fill="black", font=big)
    rows = [
        ("Invoice No:", invoice),
        ("Invoice Date:", invoice_date),
        ("Passenger:", "Sample Employee"),
        ("Mode:", "Air"),
        ("Sector:", "HYD - DEL - HYD"),
        ("Quantity:", "45,000.00"),
        ("Unit of Measure:", "INR"),
    ]
    for i, (label, value) in enumerate(rows):
        draw.text((60, 280 + i * 60), label, fill="black", font=body)
        draw.text((560, 280 + i * 60), value, fill="black", font=body)


def waste_certificate_pdf(
    certificate: str = "WD-2026-0001", disposal_date: str = "12-Sep-2026"
) -> bytes:
    """A waste disposal certificate (Scope 3 waste)."""
    return _encode(
        _page(lambda draw: _waste(draw, certificate, disposal_date)), "PDF", resolution=150
    )


def travel_invoice_pdf(invoice: str = "TR-2026-0001", invoice_date: str = "12-Sep-2026") -> bytes:
    """A travel invoice billed to the company (Scope 3 business travel, spend-based)."""
    return _encode(_page(lambda draw: _travel(draw, invoice, invoice_date)), "PDF", resolution=150)


def _statement(
    org: str, heading: str, rows: list[tuple[str, str]], smudge: str | None = None
) -> bytes:
    """A labelled statement (Phase 13 role modules). The value of the row labelled `smudge` is
    printed grey and speckled (fixed seed, so every run is identical): OCR still reads it, but with
    low confidence — Journey 3's guard rail exercised on a genuinely weak field."""

    def body(draw: ImageDraw.ImageDraw) -> None:
        big, text = _font(40), _font(28)
        draw.text((60, 110), f"{org} (fictitious)", fill="black", font=big)
        draw.text((60, 170), heading, fill="black", font=big)
        for i, (label, value) in enumerate(rows):
            colour = (160, 160, 160) if label == smudge else "black"
            draw.text((60, 280 + i * 60), label, fill="black", font=text)
            draw.text((560, 280 + i * 60), value, fill=colour, font=text)

    image = _page(body)
    if smudge:
        y = 280 + [label for label, _ in rows].index(smudge) * 60
        box = (560, y, 720, y + 40)
        region = np.array(image.crop(box))
        region[np.random.default_rng(SMUDGE_SEED).random(region.shape[:2]) < 0.6] = 255
        image.paste(Image.fromarray(region), box)
    return _encode(image, "PDF", resolution=150)


def workforce_statement_pdf(
    date: str = "30-Sep-2026", total: str = "180", women: str = "42", men: str = "138"
) -> bytes:
    """A certified headcount statement; the Men count is smudged (read at low confidence)."""
    rows = [
        ("Statement Date:", date),
        ("Total Employees:", total),
        ("Women:", women),
        ("Men:", men),
        ("Certified by:", "HR Department"),
    ]
    return _statement("Sample HR Services", "HEADCOUNT STATEMENT", rows, smudge="Men:")


def training_record_pdf(
    period: str = "01-Sep-2026 to 30-Sep-2026", total: str = "180", trained: str = "150"
) -> bytes:
    rows = [
        ("Training Period:", period),
        ("Total Employees:", total),
        ("Employees Trained:", trained),
        ("Programme:", "Site safety induction"),
    ]
    return _statement("Sample HR Services", "TRAINING ATTENDANCE RECORD", rows)


def water_bill_pdf(
    bill: str = "WB-2026-0001",
    period: str = "01-Sep-2026 to 30-Sep-2026",
    withdrawal: str = "1,250.00",
    discharge: str = "400.00",
) -> bytes:
    rows = [
        ("Bill No:", bill),
        ("Billing Period:", period),
        ("Water Source:", "Municipal supply"),
        ("Water Withdrawn:", withdrawal),
        ("Water Discharged:", discharge),
        ("Unit of Measure:", "KL"),
    ]
    return _statement("Sample Water Board", "WATER SUPPLY BILL", rows)


def procurement_statement_pdf(
    period: str = "01-Sep-2026 to 30-Sep-2026",
    total: str = "2,40,00,000",
    msme: str = "60,00,000",
) -> bytes:
    rows = [
        ("Statement Period:", period),
        ("Total Procurement:", total),
        ("Procured from MSMEs:", msme),
        ("Currency:", "INR"),
        ("Vendor count:", "46"),
    ]
    return _statement("Sample Procurement Cell", "PROCUREMENT SPEND STATEMENT", rows)


def csr_payment_pdf(
    reference: str = "CSR-2026-0001", date: str = "15-Sep-2026", amount: str = "5,00,000"
) -> bytes:
    rows = [
        ("Payment Reference:", reference),
        ("Payment Date:", date),
        ("CSR Project:", "School sanitation drive"),
        ("Amount Spent:", amount),
        ("Currency:", "INR"),
    ]
    return _statement("Sample Foundation", "CSR PAYMENT ADVICE", rows)


def penalty_order_pdf(
    order: str = "PO-2026-0001", date: str = "18-Sep-2026", amount: str = "25,000"
) -> bytes:
    rows = [
        ("Order No:", order),
        ("Order Date:", date),
        ("Authority:", "Sample Pollution Control Board"),
        ("Penalty Amount:", amount),
        ("Currency:", "INR"),
    ]
    return _statement("Sample Regulator", "PENALTY ORDER - FINE PAID", rows)


def all_samples() -> list[Sample]:
    return [
        Sample(
            "diesel_invoice_table.pdf",
            diesel_invoice_pdf(),
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
