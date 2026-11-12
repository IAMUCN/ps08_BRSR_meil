"""Extraction profiles (.grill/phase-2b-ocr-worker-decisions.md).

*Which* fields a document needs comes from `metric_field_requirements` (database configuration).
This module only says *how* to find a field by its `field_key` on a page: label synonyms in
priority order and the kind of value to read. Bump EXTRACTOR_VERSION whenever a rule changes, so
stored extractions stay reproducible (it is recorded in `ocr_jobs.model_version` and
`ocr_extractions.raw_output`).
"""

from dataclasses import dataclass

EXTRACTOR_VERSION = "rules-14"


@dataclass(frozen=True)
class Profile:
    labels: tuple[str, ...]
    kind: str  # number | identifier | period | unit | text
    exclude: tuple[str, ...] = ()
    near: tuple[str, ...] = ()  # unit: read it next to these already-extracted fields first


FIELD_PROFILES: dict[str, Profile] = {
    "quantity": Profile(
        labels=(
            "quantity emitted",
            "co2 emitted",
            "energy supplied",
            "quantity",
            "qty",
            "volume",
            "litres",
            "liters",
            "net weight",
            "distance",
        ),
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
            "units advanced",  # Indian DISCOM thermal bills
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
    # Safety incident statements (migration 0041): each count under its own label.
    "person_hours": Profile(
        labels=("person-hours worked", "person hours worked", "man-hours worked", "hours worked"),
        kind="number",
    ),
    "lost_time_injuries": Profile(
        labels=("lost time injuries", "lost-time injuries", "lti"), kind="number"
    ),
    "recordable_injuries": Profile(
        labels=(
            "total recordable injuries",
            "recordable injuries",
            "recordable work-related injuries",
        ),
        kind="number",
    ),
    "fatalities": Profile(labels=("fatalities", "number of fatalities"), kind="number"),
    "high_consequence_injuries": Profile(
        labels=("high consequence injuries", "high-consequence injuries", "high consequence"),
        kind="number",
    ),
    "trained_employees": Profile(
        labels=("employees trained", "trained employees", "number trained"), kind="number"
    ),
    "withdrawal": Profile(
        labels=(
            "water withdrawn",
            "water withdrawal",
            "total withdrawal",
            "withdrawal",
            # A water utility bill prints what was drawn as its "consumption"; that is the
            # withdrawal. Discharge is not on the bill: the person types it.
            "water consumed",
            "water consumption",
            "total consumption",
            "consumption",
            "usage",
        ),
        kind="number",
        exclude=("previous", "current reading", "average", "avg", "rate", "amount", "charge"),
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
            "bill dt",
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
            "used in",
            "mode",
            "water source",
            "csr project",
            "authority",
            "source",
        ),
        kind="text",
    ),
    # SEBI's waste table is by category; a certificate usually names one.
    "waste_category": Profile(
        labels=("waste category", "category of waste", "type of waste", "waste type"),
        kind="text",
    ),
}

# Indian electricity bills print "UNITS ADVANCED: 141" and no unit. When consumption was read
# under one of these labels and no unit is printed, the unit is kWh. It is an implication, not a
# reading, so it gets a fixed low confidence (below the review threshold): the person must
# always acknowledge it.
IMPLIED_UNIT = "kWh"
IMPLIED_UNIT_CONFIDENCE = 60.0
IMPLIED_UNIT_LABELS = (
    "units advanced",
    "units consumed",
    "net units consumed",
    "total units",
    "units billed",
)

# Electricity bills carry no "source" label; the useful source is the utility that supplied the
# power, printed in the header. Matched as whole words against the page text (add a name here when
# a new distribution company shows up). A match through the O/D confusion OCR makes ("TPCOOL" for
# TPCODL) is capped below the review threshold, so the person acknowledges it.
KNOWN_UTILITIES = (
    "TPCODL", "TPNODL", "TPSODL", "TPWODL", "TPDDL", "BSES RAJDHANI", "BSES YAMUNA",
    "ADANI ELECTRICITY", "MSEDCL", "BESCOM", "MESCOM", "HESCOM", "GESCOM", "CESC", "KSEB",
    "TNPDCL", "TANGEDCO", "APSPDCL", "APEPDCL", "APCPDCL", "TSSPDCL", "TSNPDCL", "PSPCL",
    "UPPCL", "DHBVN", "UHBVN", "JVVNL", "AVVNL", "JDVVNL", "WBSEDCL", "NBPDCL", "SBPDCL",
    "JBVNL", "CSPDCL", "DGVCL", "MGVCL", "PGVCL", "UGVCL", "HPSEBL", "UPCL", "MPPKVVCL",
    "MPPGCL", "NESCO", "WESCO", "SOUTHCO", "CESU",
)  # fmt: skip
FOLDED_UTILITY_CONFIDENCE = 70.0

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
    # Petrol, CNG and LPG share this type (migration 0017); a diesel invoice scores higher as
    # DIESEL_INVOICE.
    "FUEL_INVOICE": (
        "petrol",
        "cng",
        "lpg",
        "lng",
        "png",
        "coal",
        "motor spirit",
        "fuel",
        "litres",
        "kg",
        "invoice",
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
    "REFRIGERANT_RECORD": ("refrigerant", "sf6", "gas charged", "r-22", "r-32", "r-410a", "r-134a"),
    "MATERIAL_INVOICE": ("cement", "steel", "tmt", "opc", "ppc", "material", "net weight"),
    "PROCESS_EMISSION_STATEMENT": (
        "process emission",
        "mass balance",
        "co2 emitted",
        "calcination",
    ),
    "STEAM_HEAT_INVOICE": ("steam", "chilled water", "district cooling", "heat supplied"),
    "STACK_MONITORING_REPORT": (
        "stack",
        "monitoring",
        "nox",
        "sox",
        "particulate",
        "emission test",
    ),
    "FREIGHT_INVOICE": ("freight", "transporter", "consignment", "lorry receipt", "logistics"),
    "EMPLOYEE_TRANSPORT_INVOICE": ("employee transport", "staff bus", "shuttle", "commute"),
    "SAFETY_INCIDENT_STATEMENT": (
        "safety",
        "incident",
        "injuries",
        "fatalities",
        "person-hours",
        "lost time",
    ),
    "WORKFORCE_STATEMENT": ("headcount", "workforce", "employees", "women", "men", "statement"),
    "TRAINING_RECORD": ("training", "trained", "employees", "programme", "attendance"),
    "WATER_BILL": ("water", "withdrawal", "discharge", "meter", "supply"),
    "PROCUREMENT_STATEMENT": ("procurement", "msme", "vendor", "purchases", "spend"),
    "CSR_PAYMENT_RECORD": ("csr", "payment", "social", "responsibility", "project"),
    "PENALTY_ORDER": ("penalty", "fine", "order", "authority", "paid"),
}
