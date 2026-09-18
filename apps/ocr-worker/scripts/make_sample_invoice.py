"""Write a synthetic diesel invoice PDF with a fresh invoice number, for manual testing.

    python scripts/make_sample_invoice.py        # -> sample_diesel_invoice_<number>.pdf
    python scripts/make_sample_invoice.py --out my.pdf --invoice SMP-INV-TEST-1

Synthetic only (no real MEIL documents until Phase 18). Every run gets a new invoice number, so
repeated test uploads don't trip the duplicate-invoice warning unless you reuse a number on purpose.
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.samples import diesel_invoice_pdf  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--invoice", help="invoice number (default: a new timestamped number)")
    parser.add_argument("--out", help="output path (default: sample_diesel_invoice_<number>.pdf)")
    args = parser.parse_args()
    invoice = args.invoice or f"SMP-{datetime.now():%m%d-%H%M%S-%f}"[:20]
    out = Path(args.out or f"sample_diesel_invoice_{invoice}.pdf")
    out.write_bytes(diesel_invoice_pdf(invoice))
    print(f"{out} (invoice {invoice})")


if __name__ == "__main__":
    main()
