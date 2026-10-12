"""Write two sets of synthetic test data for a manual run-through of the whole app.

    python scripts/make_test_data.py --out "../../test data"

Each set ("test data 1", "test data 2") holds: one document per ESG activity for three projects —
in each role's folder a third are single PDFs, a third are images (JPG and PNG in turn) and the
rest are pages of one multi-bill PDF — a further multi-bill PDF for a small project,
`manifest.csv` (which file is uploaded where, by which role, as which activity, and
the values printed on it), and `sheets.json` — the rows of the org-unit and employee bulk-import
sheets, which `apps/web/scripts/test-data-sheets.mjs` turns into .xlsx files.

Set 1 is August 2026 and set 2 is September 2026 for the same projects, so month-on-month figures
have something to compare; set 2 also adds org units and their documents.

Everything is fictitious and watermarked SAMPLE. Org unit names are MEIL's published business units,
group companies and landmark projects (meil.in); every figure, vendor and person is invented.
"""

import argparse
import csv
import io
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import pypdfium2 as pdfium

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.samples import _statement  # noqa: E402

MEIL = "Megha Engineering & Infrastructures Ltd"


@dataclass(frozen=True)
class Unit:
    code: str  # the key used in this script; also the unit's code in the app unless by_name
    name: str
    level: str
    parent: str  # "" = directly under the unit chosen on screen (MEIL)
    scale: float = 0.0  # > 0: the unit submits documents, sized by this
    discom: str = ""
    by_name: bool = False  # the app holds this unit without a code: it is referred to by its name
    also_under: tuple[str, ...] = ()  # further parents of a shared unit

    @property
    def app_code(self) -> str:
        return "" if self.by_name else self.code

    @property
    def ref(self) -> str:
        """What the app knows the unit by: its code, or its name when it has none."""
        return self.name if self.by_name else self.code


# Set 1 is the hierarchy as it stands in the web app (read on 2026-10-12): nothing to import, the
# documents are filed under units that already exist. The projects there have no code, so the sheets
# and folders name them. Set 2 adds three of MEIL's own business units and a plant.
TREE_1 = [
    Unit("OLECTRA", "Olectra Greentech", "subsidiary", ""),
    Unit("OLE-MSRTC", "MSRTC e-bus order", "project", "OLECTRA", 0.8, "", by_name=True),
    Unit("OLE-BEST", "BEST Mumbai e-buses", "project", "OLECTRA", 1.4, "MSEDCL", by_name=True),
    Unit("OLE-EVEYSPV", "EVEY Trans (Mah) SPV", "project", "OLECTRA", by_name=True),
    Unit("OLE-INSULATORS", "Composite insulators", "project", "OLECTRA", by_name=True),
    Unit(
        "OLE-SEETHARAMPUR",
        "Seetharampur plant, Telangana",
        "project",
        "OLECTRA",
        1.0,
        "TSSPDCL",
        by_name=True,
    ),
    Unit("MEGHAGAS", "Megha Gas", "subsidiary", ""),
    Unit("DRILLMEC", "Drillmec", "subsidiary", ""),
    Unit("PETREVEN", "Petreven", "subsidiary", ""),
    Unit("ICOMM", "ICOMM", "subsidiary", ""),
    Unit("EVEY", "EVEY", "subsidiary", ""),
    Unit(
        "EVEY-TGSRTC",
        "TGSRTC Telangana",
        "project",
        "EVEY",
        0.4,
        "TSSPDCL",
        by_name=True,
        also_under=("OLECTRA",),
    ),
]
TREE_2 = [
    Unit("BU-WTR", "Drinking Water", "business_unit", ""),
    Unit("PRJ-UDDANAM", "Uddanam Water Project", "project", "BU-WTR", 0.5, "APEPDCL"),
    Unit("BU-HYD", "Hydrocarbons", "business_unit", ""),
    Unit("PRJ-AHM-RIG", "Ahmedabad C1R1 Rig", "project", "BU-HYD"),
    Unit("BU-MFG", "Manufacturing", "business_unit", ""),
    # Under a subsidiary that is already in the app.
    Unit("OLE-PLANT", "Olectra Electric Bus Plant", "site", "OLECTRA", 0.6, "TSSPDCL"),
]

# The unit with the faint figure, and the one that only tries the multi-bill PDF.
FAINT, SMALL = "OLE-SEETHARAMPUR", "EVEY-TGSRTC"

ROLE_NAMES = {
    "project_manager": "Project Manager",
    "ehs": "EHS - Environment",
    "hr": "HR",
    "procurement": "Procurement",
    "finance_csr": "Finance - CSR",
}


def indian(value: float, decimals: int = 2) -> str:
    """12,34,567.00 — the grouping Indian documents print."""
    whole, _, fraction = f"{abs(value):.{decimals}f}".partition(".")
    head, tail = whole[:-3], whole[-3:]
    groups = []
    while head:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return ",".join([*groups, tail]) + (f".{fraction}" if fraction else "")


@dataclass(frozen=True)
class Activity:
    metric: str  # esg_metrics.code
    name: str  # as the upload screen lists it
    role: str
    doc_type: str
    core: bool = False  # every submitting unit uploads it; the rest go to one project each
    home: str = ""  # the project that uploads a non-core activity


def quantity_doc(
    vendor, heading, number_label, date_label, extra, value, unit, value_label="Quantity:"
):
    """The common shape: a reference, a date or period, a description, a quantity and its unit."""

    def build(ctx):
        date = ctx["period"] if date_label.endswith("Period:") else ctx["date"]
        rows = [
            (number_label, ctx["ref"]),
            (date_label, date),
            ("Bill To:", f"MEIL - {ctx['unit'].name}"[:44]),
            *extra,
            (value_label, indian(value * ctx["k"])),
            ("Unit of Measure:", unit),
        ]
        expected = {"quantity": f"{value * ctx['k']:.2f}", "unit": unit, "reference": ctx["ref"]}
        return _statement(vendor, heading, rows), expected

    return build


def fuel(product, value, unit, used_in, heading="TAX INVOICE - FUEL SUPPLY"):
    return quantity_doc(
        "Deccan Fuels & Energy Pvt Ltd",
        heading,
        "Invoice No:",
        "Invoice Date:",
        [("Product:", product), ("Used in:", used_in)],
        value,
        unit,
    )


def electricity(ctx):
    units = round(86_400 * ctx["k"])
    discom = ctx["unit"].discom
    rows = [
        ("Bill No:", ctx["ref"]),
        ("Billing Period:", ctx["period"]),
        ("Consumer:", f"MEIL - {ctx['unit'].name}"[:44]),
        ("Meter No:", f"MTR-{ctx['seq']:02d}-4471"),
        ("Tariff:", "HT-I Industrial"),
        ("Units Consumed:", f"{indian(units, 0)} kWh"),
    ]
    vendor = f"{discom} Power Distribution" if discom else "Northern Hills Power Distribution Co."
    return _statement(vendor, "ELECTRICITY BILL", rows), {"consumption": str(units), "unit": "kWh"}


def renewable(ctx):
    units = round(18_400 * ctx["k"])
    rows = [
        ("Certificate No:", ctx["ref"]),
        ("Billing Period:", ctx["period"]),
        ("Issued To:", f"MEIL - {ctx['unit'].name}"[:44]),
        ("Energy Source:", "Solar (captive generation)"),
        ("Units Consumed:", f"{indian(units, 0)} kWh"),
    ]
    return (
        _statement(
            "Sunfield Renewable Energy Pvt Ltd", "RENEWABLE ENERGY CERTIFICATE - SOLAR", rows
        ),
        {"consumption": str(units), "unit": "kWh", "source": "Solar"},
    )


def waste(ctx):
    kg = 2_500 * ctx["k"]
    rows = [
        ("Certificate No:", ctx["ref"]),
        ("Disposal Date:", ctx["date"]),
        ("Generator:", f"MEIL - {ctx['unit'].name}"[:44]),
        ("Waste Type:", "Construction and demolition"),
        ("Treatment Route:", "Landfill"),
        ("Quantity:", indian(kg)),
        ("Unit of Measure:", "kg"),
        ("Authorisation No:", "SPCB/2026/SAMPLE"),
    ]
    return (
        _statement("Greenline Waste Handlers Pvt Ltd", "WASTE DISPOSAL CERTIFICATE", rows),
        {"quantity": f"{kg:.2f}", "unit": "kg", "route": "Landfill"},
    )


def water(ctx):
    drawn, discharged = 1_250 * ctx["k"], 400 * ctx["k"]
    rows = [
        ("Bill No:", ctx["ref"]),
        ("Billing Period:", ctx["period"]),
        ("Consumer:", f"MEIL - {ctx['unit'].name}"[:44]),
        ("Water Source:", "Municipal supply"),
        ("Water Withdrawn:", indian(drawn)),
        ("Water Discharged:", indian(discharged)),
        ("Unit of Measure:", "KL"),
    ]
    return (
        _statement("District Water Supply Board", "WATER SUPPLY BILL", rows),
        {"withdrawal": f"{drawn:.2f}", "discharge": f"{discharged:.2f}", "unit": "KL"},
    )


def safety(category, hours, lost_time, recordable):
    def build(ctx):
        worked = round(hours * ctx["k"])
        rows = [
            ("Statement Period:", ctx["period"]),
            ("Workforce Category:", category),
            ("Person-hours Worked:", indian(worked, 0)),
            # "Nos" after each count: OCR does not detect a lone digit on a line.
            ("Lost Time Injuries:", f"{lost_time} Nos"),
            ("Recordable Injuries:", f"{recordable} Nos"),
            ("Fatalities:", "0 Nos"),
            ("High Consequence Injuries:", "0 Nos"),
        ]
        expected = {
            "person_hours": str(worked),
            "lost_time": str(lost_time),
            "recordable": str(recordable),
        }
        org = f"MEIL {ctx['unit'].ref} EHS Department"
        return _statement(org, "SAFETY INCIDENT STATEMENT", rows), expected

    return build


def workforce(ctx):
    total = round(180 * ctx["k"])
    women = round(total * 0.23)
    rows = [
        ("Statement Date:", ctx["end"]),
        ("Total Employees:", str(total)),
        ("Women:", str(women)),
        ("Men:", str(total - women)),
        ("Certified by:", "HR Department"),
    ]
    # One statement per set has a faint Men count: a real case for the low-confidence review.
    smudge = "Men:" if ctx["unit"].code == FAINT else None
    org = f"MEIL {ctx['unit'].ref} HR Department"
    return (
        _statement(org, "HEADCOUNT STATEMENT - WORKFORCE", rows, smudge=smudge),
        {"total": str(total), "women": str(women), "men": str(total - women)},
    )


def training(ctx):
    total = round(180 * ctx["k"])
    trained = round(total * 0.82)
    rows = [
        ("Training Period:", ctx["period"]),
        ("Total Employees:", str(total)),
        ("Employees Trained:", str(trained)),
        ("Programme:", "Site safety induction"),
    ]
    org = f"MEIL {ctx['unit'].ref} HR Department"
    return (
        _statement(org, "TRAINING ATTENDANCE RECORD", rows),
        {"total": str(total), "trained": str(trained)},
    )


def procurement(ctx):
    total, msme = 24_000_000 * ctx["k"], 6_000_000 * ctx["k"]
    rows = [
        ("Statement Period:", ctx["period"]),
        ("Total Procurement:", indian(total, 0)),
        ("Procured from MSMEs:", indian(msme, 0)),
        ("Currency:", "INR"),
        ("Vendor count:", "46"),
    ]
    org = f"MEIL {ctx['unit'].ref} Procurement Cell"
    return (
        _statement(org, "PROCUREMENT SPEND STATEMENT", rows),
        {"total_spend": f"{total:.0f}", "msme_spend": f"{msme:.0f}", "unit": "INR"},
    )


def csr(ctx):
    amount = 500_000 * ctx["k"]
    rows = [
        ("Payment Reference:", ctx["ref"]),
        ("Payment Date:", ctx["date"]),
        ("CSR Project:", "Rural school infrastructure"),
        ("Amount Spent:", indian(amount, 0)),
        ("Currency:", "INR"),
    ]
    return (
        _statement("MEIL CSR Cell", "CSR PAYMENT ADVICE - SOCIAL RESPONSIBILITY", rows),
        {"amount": f"{amount:.0f}", "unit": "INR"},
    )


def penalty(ctx):
    rows = [
        ("Order No:", ctx["ref"]),
        ("Order Date:", ctx["date"]),
        ("Authority:", "State Pollution Control Board"),
        ("Penalty Amount:", "25,000"),
        ("Currency:", "INR"),
    ]
    return (
        _statement("State Regulator (sample)", "PENALTY ORDER - FINE PAID", rows),
        {"amount": "25000", "unit": "INR"},
    )


def travel(mode, value, unit, value_label="Distance:"):
    return quantity_doc(
        "Skyway Corporate Travel Desk",
        "TRAVEL INVOICE - PASSENGER TICKETS",
        "Invoice No:",
        "Invoice Date:",
        [
            ("Passenger:", "MEIL staff (group booking)"),
            ("Mode:", mode),
            ("Sector:", "HYD - DEL - HYD"),
        ],
        value,
        unit,
        value_label,
    )


def freight(vehicle, consignment, value, unit, value_label="Distance:"):
    return quantity_doc(
        "Roadline Logistics & Transporter",
        "FREIGHT INVOICE - LORRY RECEIPT",
        "Invoice No:",
        "Invoice Date:",
        [("Vehicle Class:", vehicle), ("Consignment:", consignment)],
        value,
        unit,
        value_label,
    )


def refrigerant(gas, value):
    return quantity_doc(
        "CoolServe HVAC Services",
        f"REFRIGERANT GAS CHARGED RECORD - {gas}",
        "Invoice No:",
        "Invoice Date:",
        [("Refrigerant:", gas), ("Equipment:", "Site HVAC and switchgear")],
        value,
        "kg",
    )


def stack(parameter, value):
    return quantity_doc(
        "EnviroLab Testing Services",
        "STACK MONITORING REPORT - EMISSION TEST",
        "Certificate No:",
        "Statement Period:",
        [("Parameter:", parameter), ("Stack:", "Boiler stack 1")],
        value,
        "kg",
        "Quantity Emitted:",
    )


def coal(grade, value):
    return quantity_doc(
        "Eastern Coal Traders",
        "TAX INVOICE - COAL FUEL SUPPLY",
        "Invoice No:",
        "Invoice Date:",
        [("Product:", f"Coal - {grade}"), ("Used in:", "Boiler")],
        value,
        "kg",
    )


PM, EHS, HR, PROC, FIN = "project_manager", "ehs", "hr", "procurement", "finance_csr"
POL, ZOJ, TUT = "OLE-SEETHARAMPUR", "OLE-MSRTC", "OLE-BEST"

# (activity, how its document is written). 47 activities: every one the app offers.
ACTIVITIES = [
    (
        Activity("DIESEL_CONSUMPTION", "Diesel Consumption", PM, "DIESEL_INVOICE", core=True),
        fuel("High Speed Diesel (HSD)", 1_250, "Litres", "Generator", "TAX INVOICE - DIESEL FUEL"),
    ),
    (
        Activity(
            "GRID_ELECTRICITY", "Grid Electricity Consumption", PM, "ELECTRICITY_BILL", core=True
        ),
        electricity,
    ),
    (Activity("WATER_CONSUMPTION", "Water consumption", EHS, "WATER_BILL", core=True), water),
    (
        Activity("WASTE_DISPOSED", "Waste Disposed", EHS, "WASTE_DISPOSAL_CERTIFICATE", core=True),
        waste,
    ),
    (
        Activity(
            "SAFETY_WORKERS",
            "Safety incidents — workers",
            EHS,
            "SAFETY_INCIDENT_STATEMENT",
            core=True,
        ),
        safety("Workers (including contract workers)", 240_000, 1, 3),
    ),
    (
        Activity(
            "SAFETY_EMPLOYEES",
            "Safety incidents — employees",
            EHS,
            "SAFETY_INCIDENT_STATEMENT",
            core=True,
        ),
        safety("Employees", 36_000, 0, 1),
    ),
    (
        Activity("WORKFORCE_GENDER", "Employees by gender", HR, "WORKFORCE_STATEMENT", core=True),
        workforce,
    ),
    (
        Activity("WORKFORCE_TRAINING", "Employees trained", HR, "TRAINING_RECORD", core=True),
        training,
    ),
    # Power plant: solid and gaseous fuels, process and stack emissions, purchased heat, SF6.
    (
        Activity("COAL_ANTHRACITE", "Coal — Anthracite", PM, "FUEL_INVOICE", home=TUT),
        coal("Anthracite", 42_000),
    ),
    (
        Activity("COAL_BITUMINOUS", "Coal — Bituminous", PM, "FUEL_INVOICE", home=TUT),
        coal("Bituminous", 310_000),
    ),
    (
        Activity("COAL_SUB_BITUMINOUS", "Coal — Sub-bituminous", PM, "FUEL_INVOICE", home=TUT),
        coal("Sub-bituminous", 185_000),
    ),
    (
        Activity("COAL_LIGNITE", "Coal — Lignite", PM, "FUEL_INVOICE", home=TUT),
        coal("Lignite", 96_000),
    ),
    (
        Activity("LNG_CONSUMPTION", "LNG Consumption", PM, "FUEL_INVOICE", home=TUT),
        fuel("LNG (liquefied natural gas)", 8_400, "kg", "Equipment"),
    ),
    (
        Activity("PNG_CONSUMPTION", "PNG Consumption", PM, "FUEL_INVOICE", home=TUT),
        fuel("PNG (piped natural gas)", 3_200, "SCM", "Equipment"),
    ),
    (
        Activity("PURCHASED_STEAM", "Purchased steam", PM, "STEAM_HEAT_INVOICE", home=TUT),
        quantity_doc(
            "Coastal Utilities Ltd",
            "STEAM SUPPLY INVOICE",
            "Invoice No:",
            "Invoice Date:",
            [("Service:", "Process steam, heat supplied")],
            42_000,
            "kg",
        ),
    ),
    (
        Activity(
            "PURCHASED_HEAT_COOLING", "Purchased heat / cooling", PM, "STEAM_HEAT_INVOICE", home=TUT
        ),
        quantity_doc(
            "Coastal Utilities Ltd",
            "CHILLED WATER - DISTRICT COOLING INVOICE",
            "Invoice No:",
            "Invoice Date:",
            [("Service:", "Chilled water, heat supplied")],
            12_500,
            "kWh",
            "Energy Supplied:",
        ),
    ),
    (
        Activity(
            "PROCESS_CO2", "Process emissions — CO2", EHS, "PROCESS_EMISSION_STATEMENT", home=TUT
        ),
        quantity_doc(
            "MEIL Process Engineering Cell",
            "PROCESS EMISSION STATEMENT - MASS BALANCE",
            "Certificate No:",
            "Statement Period:",
            [("Process:", "Flue gas desulphurisation")],
            18_250,
            "kg",
            "CO2 Emitted:",
        ),
    ),
    (
        Activity("NOX_EMISSIONS", "Air emissions — NOx", EHS, "STACK_MONITORING_REPORT", home=TUT),
        stack("NOx", 412.6),
    ),
    (
        Activity("SOX_EMISSIONS", "Air emissions — SOx", EHS, "STACK_MONITORING_REPORT", home=TUT),
        stack("SOx", 655.2),
    ),
    (
        Activity(
            "PM_EMISSIONS",
            "Air emissions — Particulate matter",
            EHS,
            "STACK_MONITORING_REPORT",
            home=TUT,
        ),
        stack("Particulate matter (PM)", 88.4),
    ),
    (
        Activity("SF6_TOPUP", "SF6 top-up", EHS, "REFRIGERANT_RECORD", home=TUT),
        refrigerant("SF6", 1.8),
    ),
    # Tunnel project: vehicle and camp fuels, materials, inbound freight, staff transport, HVAC.
    (
        Activity("PETROL_CONSUMPTION", "Petrol Consumption", PM, "FUEL_INVOICE", home=ZOJ),
        fuel("Petrol (motor spirit)", 640, "Litres", "Vehicle"),
    ),
    (
        Activity("CNG_CONSUMPTION", "CNG Consumption", PM, "FUEL_INVOICE", home=ZOJ),
        fuel("CNG", 380, "kg", "Vehicle"),
    ),
    (
        Activity("LPG_CONSUMPTION", "LPG Consumption", PM, "FUEL_INVOICE", home=ZOJ),
        fuel("LPG cylinders", 228, "kg", "Equipment"),
    ),
    (
        Activity("CEMENT_PURCHASED", "Cement purchased", PROC, "MATERIAL_INVOICE", home=ZOJ),
        quantity_doc(
            "Himalaya Cement Works",
            "MATERIAL INVOICE - CEMENT",
            "Invoice No:",
            "Invoice Date:",
            [("Material:", "OPC 53 Grade Cement")],
            420_000,
            "kg",
        ),
    ),
    (
        Activity("STEEL_PURCHASED", "Steel purchased", PROC, "MATERIAL_INVOICE", home=ZOJ),
        quantity_doc(
            "Northern Steel Traders",
            "MATERIAL INVOICE - TMT STEEL",
            "Invoice No:",
            "Invoice Date:",
            [("Material:", "TMT Steel Fe 500D")],
            96_000,
            "kg",
        ),
    ),
    (
        Activity(
            "FREIGHT_IN_LDV",
            "Supplier logistics — light truck (under 3.5 t)",
            PROC,
            "FREIGHT_INVOICE",
            home=ZOJ,
        ),
        freight("Light truck (under 3.5 t)", "Supplier to site: consumables", 3_800, "km"),
    ),
    (
        Activity(
            "FREIGHT_IN_MDV",
            "Supplier logistics — medium truck (under 12 t)",
            PROC,
            "FREIGHT_INVOICE",
            home=ZOJ,
        ),
        freight("Medium truck (under 12 t)", "Supplier to site: steel", 6_200, "km"),
    ),
    (
        Activity(
            "FREIGHT_IN_HDV",
            "Supplier logistics — heavy truck (over 12 t)",
            PROC,
            "FREIGHT_INVOICE",
            home=ZOJ,
        ),
        freight("Heavy truck (over 12 t)", "Supplier to site: cement", 12_400, "km"),
    ),
    (
        Activity("FREIGHT_SPEND", "Supplier logistics (spend)", PROC, "FREIGHT_INVOICE", home=ZOJ),
        freight("Mixed fleet", "Supplier to site: sundry", 385_000, "INR", "Quantity:"),
    ),
    (
        Activity(
            "COMMUTING_BUS",
            "Employee commuting — bus (distance)",
            HR,
            "EMPLOYEE_TRANSPORT_INVOICE",
            home=ZOJ,
        ),
        quantity_doc(
            "Valley Staff Bus Services",
            "EMPLOYEE TRANSPORT INVOICE - STAFF BUS",
            "Invoice No:",
            "Invoice Date:",
            [("Service:", "Staff bus, camp to portal")],
            148_000,
            "km",
            "Distance:",
        ),
    ),
    (
        Activity(
            "COMMUTING_SPEND",
            "Employee commuting (spend)",
            HR,
            "EMPLOYEE_TRANSPORT_INVOICE",
            home=ZOJ,
        ),
        quantity_doc(
            "Valley Staff Bus Services",
            "EMPLOYEE TRANSPORT INVOICE - SHUTTLE",
            "Invoice No:",
            "Invoice Date:",
            [("Service:", "Shuttle hire, staff commute")],
            212_000,
            "INR",
        ),
    ),
    (
        Activity(
            "REFRIGERANT_R22", "Refrigerant top-up — R-22", EHS, "REFRIGERANT_RECORD", home=ZOJ
        ),
        refrigerant("R-22", 6.5),
    ),
    (
        Activity(
            "REFRIGERANT_R32", "Refrigerant top-up — R-32", EHS, "REFRIGERANT_RECORD", home=ZOJ
        ),
        refrigerant("R-32", 4.2),
    ),
    (
        Activity(
            "REFRIGERANT_R410A", "Refrigerant top-up — R-410A", EHS, "REFRIGERANT_RECORD", home=ZOJ
        ),
        refrigerant("R-410A", 12.5),
    ),
    (
        Activity(
            "REFRIGERANT_R134A", "Refrigerant top-up — R-134a", EHS, "REFRIGERANT_RECORD", home=ZOJ
        ),
        refrigerant("R-134a", 3.6),
    ),
    # Irrigation project: renewable power, travel, outbound freight, and the group-level statements.
    (
        Activity(
            "RENEWABLE_ELECTRICITY", "Renewable Electricity", PM, "RENEWABLE_CERTIFICATE", home=POL
        ),
        renewable,
    ),
    (
        Activity("BUSINESS_TRAVEL_AIR", "Business Travel — Air", FIN, "TRAVEL_INVOICE", home=POL),
        travel("Air", 48_600, "km"),
    ),
    (
        Activity("BUSINESS_TRAVEL_RAIL", "Business Travel — Rail", FIN, "TRAVEL_INVOICE", home=POL),
        travel("Rail", 21_300, "km"),
    ),
    (
        Activity(
            "BUSINESS_TRAVEL_ROAD", "Business Travel — Bus / Road", FIN, "TRAVEL_INVOICE", home=POL
        ),
        travel("Bus", 9_450, "km"),
    ),
    (
        Activity(
            "BUSINESS_TRAVEL_SPEND",
            "Business Travel — other modes (spend)",
            FIN,
            "TRAVEL_INVOICE",
            home=POL,
        ),
        travel("Air", 45_000, "INR", "Quantity:"),
    ),
    (
        Activity(
            "FREIGHT_OUT_LDV",
            "Downstream logistics — light truck (under 3.5 t)",
            PROC,
            "FREIGHT_INVOICE",
            home=POL,
        ),
        freight("Light truck (under 3.5 t)", "Site to client store: spares", 2_100, "km"),
    ),
    (
        Activity(
            "FREIGHT_OUT_MDV",
            "Downstream logistics — medium truck (under 12 t)",
            PROC,
            "FREIGHT_INVOICE",
            home=POL,
        ),
        freight("Medium truck (under 12 t)", "Site to client yard: gates", 4_700, "km"),
    ),
    (
        Activity(
            "FREIGHT_OUT_HDV",
            "Downstream logistics — heavy truck (over 12 t)",
            PROC,
            "FREIGHT_INVOICE",
            home=POL,
        ),
        freight("Heavy truck (over 12 t)", "Site to client yard: pumps", 8_900, "km"),
    ),
    (
        Activity(
            "MSME_PROCUREMENT", "MSME share of procurement", PROC, "PROCUREMENT_STATEMENT", home=POL
        ),
        procurement,
    ),
    (Activity("CSR_EXPENDITURE", "CSR expenditure", FIN, "CSR_PAYMENT_RECORD", home=POL), csr),
    (Activity("FINES_PENALTIES", "Fines and penalties", FIN, "PENALTY_ORDER", home=POL), penalty),
]

SETS = {
    1: {"month": "Aug-2026", "label": "August 2026", "days": 31, "factor": 1.0, "new": TREE_1},
    2: {"month": "Sep-2026", "label": "September 2026", "days": 30, "factor": 1.07, "new": TREE_2},
}

PEOPLE = [
    "Anil Kumar Rao",
    "Sunita Reddy",
    "Mohammed Irfan",
    "Lakshmi Narayanan",
    "Rajesh Varma",
    "Priya Deshmukh",
    "Suresh Babu",
    "Kavitha Menon",
    "Arjun Singh",
    "Deepa Iyer",
    "Vikram Chauhan",
    "Meena Kumari",
    "Naveen Goud",
    "Farida Begum",
    "Sandeep Patil",
    "Anjali Sharma",
    "Ramesh Naidu",
    "Pooja Hegde",
    "Imran Sheikh",
    "Geeta Joshi",
    "Karthik Subramanian",
    "Swathi Rao",
    "Harish Chandra",
    "Nandini Das",
    "Tarun Mehta",
    "Bhavana Pillai",
    "Yusuf Khan",
    "Rekha Yadav",
    "Manoj Tiwari",
    "Shalini Gupta",
    "Prakash Shetty",
    "Divya Nair",
]


def employee_rows(set_number: int, submitting: list[Unit]) -> list[dict]:
    """One person per uploading role at each submitting unit, and one approver. No emails:
    the person running the test types those."""
    rows = []
    start = 1001 if set_number == 1 else 2001
    people = PEOPLE[:18] if set_number == 1 else PEOPLE[18:]
    seats = [(unit.ref, role) for unit in submitting for role in ROLE_NAMES]
    small = next(u.ref for u in TREE_1 if u.code == SMALL)
    # Corporate ESG approves what the projects submit (nobody approves their own record).
    seats.append(("MEIL" if set_number == 1 else "OLECTRA", "corporate_esg"))
    for index, (scope, role) in enumerate(seats):
        if scope == small and role != PM:
            continue  # the small project only tries the multi-bill PDF (a Project Manager's)
        rows.append(
            {
                "Employee ID": f"MEIL{start + index}",
                "Name": people[len(rows) % len(people)],
                "Email": "",
                "Role": role,
                "Organization Scope": scope,
            }
        )
    return rows


def bundle(pages: list[bytes]) -> bytes:
    merged = pdfium.PdfDocument.new()
    for page in pages:
        source = pdfium.PdfDocument(page)
        merged.import_pages(source)
        source.close()
    path = Path("_bundle.tmp.pdf")
    merged.save(path)
    data = path.read_bytes()
    path.unlink()
    return data


def as_image(pdf: bytes, fmt: str) -> bytes:
    """The one-page PDF as an image of the size it was drawn at (the samples are 150 dpi)."""
    document = pdfium.PdfDocument(pdf)
    image = document[0].render(scale=150 / 72).to_pil().convert("RGB")
    document.close()
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, **({"quality": 90} if fmt == "JPEG" else {}))
    return buffer.getvalue()


def apart(bills: list[dict]) -> list[dict]:
    """Order a multi-bill PDF's pages so bills of one document type are not neighbours where that
    can be avoided: consecutive bills of one type are proposed as a single bill."""
    left, ordered = list(bills), []
    while left:
        last = ordered[-1]["Document type"] if ordered else None
        pick = next((b for b in left if b["Document type"] != last), left[0])
        left.remove(pick)
        ordered.append(pick)
    return ordered


def write_set(set_number: int, root: Path) -> int:
    spec = SETS[set_number]
    folder = root / f"test data {set_number}"
    # Set 2 uploads for set 1's projects again (the next month) and for its own new units.
    submitting = [u for tree in (TREE_1, TREE_2)[:set_number] for u in tree if u.scale]
    manifest, seq = [], 0
    # Per unit and role, in turn: a single PDF, an image, a page of that role's multi-bill PDF.
    turn: dict[tuple[str, str], int] = {}
    held: dict[tuple[str, str], list[dict]] = {}
    image_count = 0
    for unit in submitting:
        if unit.code == SMALL:
            continue
        for activity, build in ACTIVITIES:
            if not (activity.core or activity.home == unit.code):
                continue
            seq += 1
            ctx = {
                "unit": unit,
                "seq": seq,
                "k": unit.scale * spec["factor"],
                "ref": f"MEIL-T{set_number}-{seq:03d}",
                "date": f"{10 + seq % 18:02d}-{spec['month']}",
                "end": f"{spec['days']}-{spec['month']}",
                "period": f"01-{spec['month']} to {spec['days']}-{spec['month']}",
            }
            data, expected = build(ctx)
            group = (unit.ref, activity.role)
            position = turn.get(group, 0)
            turn[group] = position + 1
            row = {
                "File": "",
                "Reporting period": spec["label"],
                "Org unit code": unit.app_code,
                "Org unit": unit.name,
                "Upload as role": ROLE_NAMES[activity.role],
                "ESG activity": activity.name,
                "Document type": activity.doc_type,
                "Values printed": "; ".join(f"{k}={v}" for k, v in expected.items()),
            }
            if position % 3 == 2:
                held.setdefault(group, []).append({**row, "data": data})
                continue
            extension = "pdf"
            if position % 3 == 1:
                image_count += 1
                extension = "jpg" if image_count % 2 else "png"
                data = as_image(data, "JPEG" if extension == "jpg" else "PNG")
            path = (
                Path("documents")
                / unit.ref
                / ROLE_NAMES[activity.role]
                / f"{seq:03d} {activity.metric}.{extension}"
            )
            (folder / path).parent.mkdir(parents=True, exist_ok=True)
            (folder / path).write_bytes(data)
            manifest.append({**row, "File": path.as_posix()})
    for (code, role), bills in held.items():
        bills = apart(bills)
        single = len(bills) == 1
        name = (
            f"{bills[0]['ESG activity']}.pdf" if single else f"multi-bill ({len(bills)} bills).pdf"
        )
        path = Path("documents") / code / ROLE_NAMES[role] / name
        data = bills[0]["data"] if single else bundle([b["data"] for b in bills])
        (folder / path).write_bytes(data)
        first = {k: v for k, v in bills[0].items() if k != "data"}
        if single:
            manifest.append({**first, "File": path.as_posix()})
            continue
        manifest.append(
            {
                **first,
                "File": path.as_posix(),
                "ESG activity": 'choose "A PDF with several bills"',
                "Document type": f"({len(bills)} bills)",
                "Values printed": " | ".join(
                    f"page {n}: {b['ESG activity']} ({b['Values printed']})"
                    for n, b in enumerate(bills, 1)
                ),
            }
        )
    # One PDF holding three bills of different activities, all a Project Manager may upload.
    small = next(u for u in TREE_1 if u.code == SMALL)
    pages, kinds = [], []
    for metric in ("DIESEL_CONSUMPTION", "GRID_ELECTRICITY", "PETROL_CONSUMPTION"):
        activity, build = next(a for a in ACTIVITIES if a[0].metric == metric)
        seq += 1
        ctx = {
            "unit": small,
            "seq": seq,
            "k": small.scale * spec["factor"],
            "ref": f"MEIL-T{set_number}-{seq:03d}",
            "date": f"12-{spec['month']}",
            "end": f"{spec['days']}-{spec['month']}",
            "period": f"01-{spec['month']} to {spec['days']}-{spec['month']}",
        }
        data, expected = build(ctx)
        pages.append(data)
        kinds.append(
            f"page {len(pages)}: {activity.name} "
            f"({'; '.join(f'{k}={v}' for k, v in expected.items())})"
        )
    path = Path("documents") / small.ref / ROLE_NAMES[PM] / "multi-bill (3 bills in one PDF).pdf"
    (folder / path).parent.mkdir(parents=True, exist_ok=True)
    (folder / path).write_bytes(bundle(pages))
    manifest.append(
        {
            "File": path.as_posix(),
            "Reporting period": spec["label"],
            "Org unit code": small.app_code,
            "Org unit": small.name,
            "Upload as role": ROLE_NAMES[PM],
            "ESG activity": 'choose "A PDF with several bills"',
            "Document type": "(3 bills)",
            "Values printed": " | ".join(kinds),
        }
    )

    with (folder / "manifest.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(manifest[0]))
        writer.writeheader()
        writer.writerows(manifest)
    new_submitting = [u for u in spec["new"] if u.scale]
    sheets = {
        # Set 1's units are already in the app: its sheet shows the hierarchy, it is not for import.
        "orgUnitsExist": set_number == 1,
        "orgUnits": [
            {
                "Code": u.app_code,
                "Name": u.name,
                "Level": u.level,
                "Parent code": ", ".join(p for p in (u.parent, *u.also_under) if p),
            }
            for u in spec["new"]
        ],
        "employees": employee_rows(set_number, new_submitting),
    }
    (folder / "sheets.json").write_text(json.dumps(sheets, indent=2), encoding="utf-8")
    return len(manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default="test data", help="folder to write the two sets into")
    args = parser.parse_args()
    for set_number in SETS:
        count = write_set(set_number, Path(args.out))
        print(f"test data {set_number}: {count} documents")


if __name__ == "__main__":
    main()
