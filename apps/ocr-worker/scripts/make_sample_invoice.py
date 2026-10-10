"""Write a synthetic fuel invoice or electricity bill PDF with a fresh number, for manual testing.

    python scripts/make_sample_invoice.py              # -> sample_diesel_invoice_<number>.pdf
    python scripts/make_sample_invoice.py --kind electricity
    python scripts/make_sample_invoice.py --kind workforce   # also training, safety, water,
                                                              # procurement, csr, penalty
    python scripts/make_sample_invoice.py --out my.pdf --invoice SMP-INV-TEST-1

Synthetic only (no real MEIL documents until Phase 18). Every run gets a new invoice number, so
repeated test uploads don't trip the duplicate-invoice warning unless you reuse a number on purpose.
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.samples import (  # noqa: E402
    csr_payment_pdf,
    diesel_invoice_pdf,
    electricity_bill_pdf,
    penalty_order_pdf,
    procurement_statement_pdf,
    safety_statement_pdf,
    training_record_pdf,
    travel_invoice_pdf,
    waste_certificate_pdf,
    water_bill_pdf,
    workforce_statement_pdf,
)

# Phase 13 documents: kind -> (writer, takes a reference number?). All take a date or period next.
MODULES = {
    "workforce": (workforce_statement_pdf, False),
    "training": (training_record_pdf, False),
    "safety": (safety_statement_pdf, False),
    "water": (water_bill_pdf, True),
    "procurement": (procurement_statement_pdf, False),
    "csr": (csr_payment_pdf, True),
    "penalty": (penalty_order_pdf, True),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--kind",
        choices=("diesel", "electricity", "waste", "travel", *MODULES),
        default="diesel",
        help="which document to write",
    )
    parser.add_argument("--invoice", help="invoice/bill number (default: a new timestamped number)")
    parser.add_argument("--period", help="billing period or date printed on the document")
    parser.add_argument("--out", help="output path (default: sample_<kind>_<number>.pdf)")
    args = parser.parse_args()
    invoice = args.invoice or f"SMP-{datetime.now():%m%d-%H%M%S-%f}"[:20]
    if args.kind in MODULES:
        write, has_reference = MODULES[args.kind]
        period = args.period or f"{datetime.now():%d-%b-%Y}"
        out = Path(args.out or f"sample_{args.kind}_{invoice}.pdf")
        out.write_bytes(write(invoice, period) if has_reference else write(period))
        print(f"{out} ({args.kind}, {period})")
        return
    if args.kind == "electricity":
        period = args.period or f"01-{datetime.now():%b-%Y} to 28-{datetime.now():%b-%Y}"
        out = Path(args.out or f"sample_electricity_bill_{invoice}.pdf")
        out.write_bytes(electricity_bill_pdf(invoice, period))
        print(f"{out} (bill {invoice}, {period})")
        return
    if args.kind == "waste":
        date = args.period or f"{datetime.now():%d-%b-%Y}"
        out = Path(args.out or f"sample_waste_certificate_{invoice}.pdf")
        out.write_bytes(waste_certificate_pdf(invoice, date))
        print(f"{out} (certificate {invoice}, {date})")
        return
    if args.kind == "travel":
        date = args.period or f"{datetime.now():%d-%b-%Y}"
        out = Path(args.out or f"sample_travel_invoice_{invoice}.pdf")
        out.write_bytes(travel_invoice_pdf(invoice, date))
        print(f"{out} (invoice {invoice}, {date})")
        return
    out = Path(args.out or f"sample_diesel_invoice_{invoice}.pdf")
    out.write_bytes(diesel_invoice_pdf(invoice))
    print(f"{out} (invoice {invoice})")


if __name__ == "__main__":
    main()
