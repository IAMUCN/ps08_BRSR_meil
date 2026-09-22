"""Extraction profiles (.grill/phase-2b-ocr-worker-decisions.md).

*Which* fields a document needs comes from `metric_field_requirements` (database configuration).
This module only says *how* to find a field by its `field_key` on a page: label synonyms in
priority order and the kind of value to read. Bump EXTRACTOR_VERSION whenever a rule changes, so
stored extractions stay reproducible (it is recorded in `ocr_jobs.model_version` and
`ocr_extractions.raw_output`).
"""

from dataclasses import dataclass

EXTRACTOR_VERSION = "rules-4"


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
    # Phase 13 role modules: several numbers per document, each under its own label.
    "total_employees": Profile(
        labels=("total employees", "total headcount", "total workforce", "headcount"),
        kind="number",
        exclude=("trained",),
    ),
    "female_employees": Profile(labels=("women", "female employees", "female"), kind="number"),
    "male_employees": Profile(labels=("men", "male employees", "male"), kind="number"),
    "trained_employees": Profile(
        labels=("employees trained", "trained employees", "number trained"), kind="number"
    ),
    "withdrawal": Profile(
        labels=("water withdrawn", "water withdrawal", "total withdrawal", "withdrawal"),
        kind="number",
    ),
    "discharge": Profile(
        labels=("water discharged", "wastewater discharged", "effluent discharged", "discharge"),
        kind="number",
    ),
    "total_spend": Profile(
        labels=("total procurement", "total purchases", "total spend"), kind="number"
    ),
    "msme_spend": Profile(
        labels=("procured from msmes", "msme procurement", "msme purchases", "msme"),
        kind="number",
    ),
    "amount": Profile(
        labels=("amount spent", "amount paid", "penalty amount", "amount"), kind="number"
    ),
    "invoice_number": Profile(
        labels=(
            "invoice number",
            "invoice no",
            "invoice #",
            "inv no",
            "bill number",
            "bill no",
            # Scope 3 evidence carries the same idea under other names.
            "certificate number",
            "certificate no",
            "manifest no",
            "payment reference",
            "payment ref",
            "order number",
            "order no",
        ),
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
            "disposal date",
            "date of disposal",
            "statement date",
            "statement period",
            "training period",
            "payment date",
            "order date",
            "as on",
        ),
        kind="period",
        exclude=("due",),
    ),
    "unit": Profile(
        labels=("unit of measure", "uom", "unit", "currency"),
        kind="unit",
        near=("quantity", "consumption", "withdrawal", "total_spend", "amount"),
    ),
    "source_classification": Profile(
        labels=(
            "energy source",
            "source of supply",
            "supply source",
            "treatment route",
            "disposal route",
            "mode",
            "water source",
            "csr project",
            "authority",
            "source",
        ),
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
    "RENEWABLE_CERTIFICATE": (
        "renewable",
        "certificate",
        "solar",
        "wind",
        "generation",
        "rec",
    ),
    "WASTE_DISPOSAL_CERTIFICATE": (
        "waste",
        "disposal",
        "certificate",
        "landfill",
        "manifest",
        "treatment",
    ),
    "TRAVEL_INVOICE": ("travel", "airline", "air", "rail", "passenger", "sector", "ticket"),
    "WORKFORCE_STATEMENT": ("headcount", "workforce", "employees", "women", "men", "statement"),
    "TRAINING_RECORD": ("training", "trained", "employees", "programme", "attendance"),
    "WATER_BILL": ("water", "withdrawal", "discharge", "meter", "supply"),
    "PROCUREMENT_STATEMENT": ("procurement", "msme", "vendor", "purchases", "spend"),
    "CSR_PAYMENT_RECORD": ("csr", "payment", "social", "responsibility", "project"),
    "PENALTY_ORDER": ("penalty", "fine", "order", "authority", "paid"),
}
