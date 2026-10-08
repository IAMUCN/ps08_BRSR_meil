"""Write one synthetic PDF of several different bills, one page each, to test multi-bill PDFs.

    python scripts/make_sample_bundle.py --kinds electricity,diesel,water --out bundle.pdf
    python scripts/make_sample_bundle.py --kinds diesel,electricity --reference BND-TEST

Kinds are the ones make_sample_invoice.py knows. Each bill gets its own number (reference-1, ...).
Synthetic only.
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

import pypdfium2 as pdfium

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.samples import (  # noqa: E402
    csr_payment_pdf,
    diesel_invoice_pdf,
    electricity_bill_pdf,
    penalty_order_pdf,
    procurement_statement_pdf,
    training_record_pdf,
    travel_invoice_pdf,
    waste_certificate_pdf,
    water_bill_pdf,
    workforce_statement_pdf,
)


def make(kind: str, reference: str, today: str) -> bytes:
    month = today[3:]
    writers = {
        "diesel": lambda: diesel_invoice_pdf(reference),
        "electricity": lambda: electricity_bill_pdf(reference, f"01-{month} to 28-{month}"),
        "waste": lambda: waste_certificate_pdf(reference, today),
        "travel": lambda: travel_invoice_pdf(reference, today),
        "workforce": lambda: workforce_statement_pdf(today),
        "training": lambda: training_record_pdf(today),
        "water": lambda: water_bill_pdf(reference, today),
        "procurement": lambda: procurement_statement_pdf(today),
        "csr": lambda: csr_payment_pdf(reference, today),
        "penalty": lambda: penalty_order_pdf(reference, today),
    }
    if kind not in writers:
        raise SystemExit(f"unknown kind {kind!r}; choose from {', '.join(writers)}")
    return writers[kind]()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--kinds", default="electricity,diesel,water")
    parser.add_argument("--reference", default=f"BND-{datetime.now():%m%d-%H%M%S}")
    parser.add_argument("--out", default="sample_bundle.pdf")
    args = parser.parse_args()
    today = f"{datetime.now():%d-%b-%Y}"
    merged = pdfium.PdfDocument.new()
    for number, kind in enumerate(args.kinds.split(","), start=1):
        source = pdfium.PdfDocument(make(kind.strip(), f"{args.reference}-{number}", today))
        merged.import_pages(source)
        source.close()
    merged.save(args.out)
    print(f"{args.out} ({len(merged)} pages: {args.kinds})")


if __name__ == "__main__":
    main()
