"""Extraction profiles (.grill/phase-2b-ocr-worker-decisions.md).

*Which* fields a document needs comes from `metric_field_requirements` (database configuration).
This module only says *how* to find a field by its `field_key` on a page: label synonyms in
priority order and the kind of value to read. Bump EXTRACTOR_VERSION whenever a rule changes, so
stored extractions stay reproducible (it is recorded in `ocr_jobs.model_version` and
`ocr_extractions.raw_output`).
"""

from dataclasses import dataclass

EXTRACTOR_VERSION = "rules-1"


@dataclass(frozen=True)
class Profile:
    labels: tuple[str, ...]
    kind: str  # number | identifier | period | unit | text
    exclude: tuple[str, ...] = ()
    near: tuple[str, ...] = ()  # unit: read it next to these already-extracted fields first


FIELD_PROFILES: dict[str, Profile] = {
    "quantity": Profile(
        labels=("quantity", "qty", "volume", "litres", "liters"),
        kind="number",
        exclude=("rate", "price", "amount"),
    ),
    "consumption": Profile(
        labels=(
            "units consumed",
            "net units consumed",
            "energy consumed",
            "kwh consumed",
            "total units",
            "units billed",
            "consumption",
        ),
        kind="number",
        exclude=("previous", "current reading", "rate", "amount"),
    ),
    "invoice_number": Profile(
        labels=("invoice number", "invoice no", "invoice #", "inv no", "bill number", "bill no"),
        kind="identifier",
    ),
    "billing_period": Profile(
        labels=(
            "billing period",
            "bill period",
            "supply period",
            "period of supply",
            "period",
            "invoice date",
            "bill date",
        ),
        kind="period",
        exclude=("due",),
    ),
    "unit": Profile(
        labels=("unit of measure", "uom", "unit"), kind="unit", near=("quantity", "consumption")
    ),
    "source_classification": Profile(
        labels=("energy source", "source of supply", "supply source", "source"),
        kind="text",
    ),
}

# Classification only chooses among the document types mapped to the record's metric. A type needs
# at least MIN_CLASSIFICATION_SCORE distinct keywords and must beat every other candidate.
MIN_CLASSIFICATION_SCORE = 2
DOCUMENT_TYPE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "DIESEL_INVOICE": ("diesel", "hsd", "high speed diesel", "fuel", "litres", "ltr", "invoice"),
    "ELECTRICITY_BILL": (
        "electricity",
        "kwh",
        "units consumed",
        "meter",
        "tariff",
        "discom",
        "energy charges",
    ),
}
