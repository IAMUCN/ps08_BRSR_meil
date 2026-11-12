"""Pure extraction/classification rules — no PaddleOCR needed (runs in CI)."""

import unittest

from worker.extraction.fields import (
    ExtractedField,
    FieldSpec,
    TextLine,
    classify,
    extract_fields,
    fields_needing_attention,
)

DIESEL_FIELDS = [
    FieldSpec("quantity", "Quantity", "number"),
    FieldSpec("unit", "Unit", "unit"),
    FieldSpec("invoice_number", "Invoice number", "text"),
    FieldSpec("billing_period", "Billing period", "text"),
]


def line(text, x0, y0, x1=None, y1=None, score=0.97, page=1):
    return TextLine(
        text, score, (x0, y0, x1 if x1 is not None else x0 + 10 * len(text), y1 or y0 + 20), page
    )


def values(fields):
    return {f.key: f.value for f in fields}


class ExtractFieldsTest(unittest.TestCase):
    def test_several_numbers_each_under_its_own_label(self):
        # "Men" must not match inside "Women"; "Total Employees" must not take the trained count.
        lines = [
            line("Total Employees:", 60, 280),
            line("180", 560, 280),
            line("Women:", 60, 340),
            line("42", 560, 340),
            line("Men:", 60, 400),
            line("138", 560, 400, score=0.68),
        ]
        specs = [
            FieldSpec("total_employees", "Total employees", "number"),
            FieldSpec("female_employees", "Women", "number"),
            FieldSpec("male_employees", "Men", "number"),
        ]
        fields = {f.key: f for f in extract_fields(lines, specs)}
        self.assertEqual(
            {k: f.value for k, f in fields.items()},
            {"total_employees": "180", "female_employees": "42", "male_employees": "138"},
        )
        self.assertEqual(fields["male_employees"].confidence, 68.0)

    def test_water_units_in_cubic_metres(self):
        lines = [line("Water Withdrawn: 1,250 m3", 40, 100)]
        specs = [
            FieldSpec("withdrawal", "Water withdrawn", "number"),
            FieldSpec("unit", "Unit", "unit"),
        ]
        self.assertEqual(values(extract_fields(lines, specs)), {"withdrawal": "1250", "unit": "m3"})

    def test_distance_gas_and_weight_units(self):
        # rules-11: travel in km, piped gas in SCM, materials by net weight.
        specs = [FieldSpec("quantity", "Quantity", "number"), FieldSpec("unit", "Unit", "unit")]
        for text, expected in [
            ("Distance: 1,148 km", {"quantity": "1148", "unit": "km"}),
            ("Quantity: 320 SCM", {"quantity": "320", "unit": "SCM"}),
            ("Net Weight: 25 MT", {"quantity": "25", "unit": "MT"}),
        ]:
            self.assertEqual(values(extract_fields([line(text, 40, 100)], specs)), expected)

    def test_label_and_value_on_the_same_line(self):
        lines = [
            line("Invoice No: SMP-INV-2026-0042", 40, 100),
            line("Invoice Date: 05-Sep-2026", 40, 130),
            line("Quantity: 1,250.00 Litres", 40, 300, score=0.91),
        ]
        fields = extract_fields(lines, DIESEL_FIELDS)
        self.assertEqual(
            values(fields),
            {
                "quantity": "1250.00",
                "unit": "Litres",
                "invoice_number": "SMP-INV-2026-0042",
                "billing_period": "05-Sep-2026",
            },
        )
        self.assertEqual(fields[0].confidence, 91.0)

    def test_value_to_the_right_and_table_value_below_header(self):
        lines = [
            line("Bill No.", 40, 100, 120),
            line("EB-839271", 300, 102, 420),
            line("Billing Period", 40, 140, 180),
            line("01-Aug-2026 to 31-Aug-2026", 300, 141, 560, score=0.88),
            line("Description", 40, 300, 200),
            line("Qty (Ltr)", 400, 300, 490),
            line("Rate", 600, 300, 650),
            line("High Speed Diesel", 40, 340, 220),
            line("1,25,000.5", 395, 341, 500, score=0.8),
            line("92.50", 600, 341, 660),
        ]
        fields = extract_fields(lines, DIESEL_FIELDS)
        self.assertEqual(
            values(fields),
            {
                "quantity": "125000.5",
                "unit": "Ltr",
                "invoice_number": "EB-839271",
                "billing_period": "01-Aug-2026 to 31-Aug-2026",
            },
        )
        by_key = {f.key: f for f in fields}
        # Confidence of a split match is the weaker of label and value.
        self.assertEqual(by_key["quantity"].confidence, 80.0)
        self.assertEqual(by_key["quantity"].source["method"], "below")
        self.assertEqual(by_key["billing_period"].confidence, 88.0)

    def test_missing_field_is_never_invented(self):
        lines = [line("Quantity: 40 Litres", 40, 100)]
        fields = {f.key: f for f in extract_fields(lines, DIESEL_FIELDS)}
        self.assertIsNone(fields["invoice_number"].value)
        self.assertIsNone(fields["invoice_number"].confidence)
        self.assertEqual(fields["invoice_number"].source["method"], "not_found")

    def test_waste_category_and_route_are_read_from_their_own_labels(self):
        specs = [
            FieldSpec("quantity", "Quantity", "number"),
            FieldSpec("source_classification", "Treatment route", "text"),
            FieldSpec("waste_category", "Waste category", "text"),
        ]
        lines = [
            line("Waste Type: Construction debris (non-hazardous)", 40, 100),
            line("Treatment Route: Landfill", 40, 130),
            line("Quantity: 2,500.00", 40, 160),
        ]
        found = values(extract_fields(lines, specs))
        self.assertEqual(found["waste_category"], "Construction debris (non-hazardous)")
        self.assertEqual(found["source_classification"], "Landfill")
        # A certificate that names no category leaves the field empty for the person.
        self.assertIsNone(values(extract_fields(lines[1:], specs))["waste_category"])

    def test_a_stack_monitoring_report_is_told_from_a_steam_invoice(self):
        candidates = {"STACK_MONITORING_REPORT": "s", "STEAM_HEAT_INVOICE": "h"}
        stack = [
            line("Stack Emission Monitoring Report", 0, 0),
            line("NOx  SOx  Particulate", 0, 30),
        ]
        self.assertEqual(classify(stack, candidates)[0], "STACK_MONITORING_REPORT")

    def test_an_invoice_number_is_never_taken_from_a_date(self):
        # Phase 20: a reference with no digits was skipped and the next line's date read instead, at
        # high confidence. A date is never an identifier: the field is left for the person to fill.
        lines = [
            line("Invoice No: A-MUCDEATL", 40, 100),
            line("Invoice Date: 05-Sep-2026", 40, 130),
        ]
        fields = {f.key: f for f in extract_fields(lines, DIESEL_FIELDS)}
        self.assertIsNone(fields["invoice_number"].value)
        self.assertEqual(fields["billing_period"].value, "05-Sep-2026")
        # An identifier that merely contains date-like digits is still read; an ISO date is not.
        lines = [line("Invoice No: SMP-INV-2026-0042", 40, 100)]
        found = values(extract_fields(lines, DIESEL_FIELDS))
        self.assertEqual(found["invoice_number"], "SMP-INV-2026-0042")
        lines = [line("Invoice No:", 40, 100), line("2026-09-05", 40, 130, 140)]
        self.assertIsNone(values(extract_fields(lines, DIESEL_FIELDS))["invoice_number"])

    def test_field_without_a_rule_is_reported_missing(self):
        fields = extract_fields(
            [line("Anything 12", 0, 0)], [FieldSpec("mystery", "Mystery", "text")]
        )
        self.assertEqual(fields[0].source["method"], "no_rule_for_field")
        self.assertIsNone(fields[0].value)

    def test_excluded_words_and_due_dates_are_skipped(self):
        lines = [
            line("Due Date: 20-Sep-2026", 40, 100),
            line("Bill Date: 05-Sep-2026", 40, 130),
            line("Rate per litre quantity 92.50", 40, 160),
        ]
        fields = values(extract_fields(lines, DIESEL_FIELDS))
        self.assertEqual(fields["billing_period"], "05-Sep-2026")
        self.assertIsNone(fields["quantity"])

    def test_electricity_bill_fields(self):
        specs = [
            FieldSpec("consumption", "Consumption", "number"),
            FieldSpec("unit", "Unit", "unit"),
            FieldSpec("billing_period", "Billing period", "text"),
            FieldSpec("source_classification", "Source classification", "text"),
        ]
        lines = [
            line("Previous Reading 10,200", 40, 100),
            line("Units Consumed", 40, 140, 200),
            line("102,430 kWh", 300, 141, 420),
            line("Billing Period: 01/08/2026 - 31/08/2026", 40, 180),
        ]
        fields = values(extract_fields(lines, specs))
        self.assertEqual(
            fields,
            {
                "consumption": "102430",
                "unit": "kWh",
                "billing_period": "01/08/2026 to 31/08/2026",
                "source_classification": None,
            },
        )


class FieldsNeedingAttentionTest(unittest.TestCase):
    SPECS = [
        FieldSpec("consumption", "Consumption", "number"),
        FieldSpec("source_classification", "Source classification", "text", required=False),
        FieldSpec("billing_period", "Billing period", "text"),
    ]

    def fields(self, **values):
        return [
            ExtractedField(key, key, value, confidence)
            for key, (value, confidence) in values.items()
        ]

    def test_low_confidence_and_missing_required_fields_count(self):
        fields = self.fields(
            consumption=("102430", 79.9),
            source_classification=(None, None),  # optional: missing is fine
            billing_period=(None, None),  # required: missing needs attention
        )
        self.assertEqual(
            fields_needing_attention(fields, self.SPECS, 80), ["consumption", "billing_period"]
        )

    def test_threshold_is_inclusive(self):
        fields = self.fields(consumption=("1", 80.0), billing_period=("Aug", 99.0))
        self.assertEqual(fields_needing_attention(fields, self.SPECS, 80), [])

    def test_no_configured_threshold_flags_every_found_field(self):
        fields = self.fields(consumption=("1", 99.0), billing_period=("Aug", 99.0))
        self.assertEqual(
            fields_needing_attention(fields, self.SPECS, None), ["consumption", "billing_period"]
        )


class ClassifyTest(unittest.TestCase):
    CANDIDATES = {"DIESEL_INVOICE": "d", "ELECTRICITY_BILL": "e"}

    def test_picks_the_type_with_most_keywords(self):
        lines = [line("TAX INVOICE", 0, 0), line("High Speed Diesel (HSD) 1,250 Litres", 0, 30)]
        code, scores = classify(lines, self.CANDIDATES)
        self.assertEqual(code, "DIESEL_INVOICE")
        self.assertGreaterEqual(scores["DIESEL_INVOICE"], 2)

    def test_too_little_evidence_or_a_tie_leaves_type_unknown(self):
        self.assertIsNone(classify([line("Invoice", 0, 0)], self.CANDIDATES)[0])
        tie = [line("Fuel invoice", 0, 0), line("Meter tariff", 0, 30)]
        self.assertIsNone(classify(tie, self.CANDIDATES)[0])

    def test_only_mapped_types_are_considered(self):
        lines = [line("Electricity bill, 500 kWh, tariff LT-II", 0, 0)]
        self.assertIsNone(classify(lines, {"DIESEL_INVOICE": "d"})[0])


class DiscomThermalBillTest(unittest.TestCase):
    def test_units_advanced_is_consumption(self):
        lines = [line("UNITS ADVANCED:", 28, 399, 93, 412), line("141", 151, 401, 165, 411)]
        fields = extract_fields(lines, [FieldSpec("consumption", "Consumption", "number")])
        self.assertEqual(values(fields), {"consumption": "141"})

    def test_billing_period_is_previous_to_present_reading_date(self):
        # The bill prints no "billing period": only the meter readings, and a later line with
        # "PRES." that has no date must not be mistaken for the present reading.
        lines = [
            # Boxes as PaddleOCR drew them on a real bill: the date is its own box and overlaps the
            # label's box by a few pixels.
            line("PRES:5830", 51, 528, 114, 548),
            line("13-08-2026", 106, 532, 181, 549),
            line("PREV:5689 11-07-2026", 51, 542, 182, 565),
            line("PRES. BILL AMT:", 44, 697),
        ]
        fields = extract_fields(lines, [FieldSpec("billing_period", "Billing period", "text")])
        self.assertEqual(values(fields), {"billing_period": "11-07-2026 to 13-08-2026"})

    def test_date_is_not_read_from_the_end_of_a_longer_number(self):
        lines = [line("Bill date: 5830 13-08-2026", 10, 10)]
        fields = extract_fields(lines, [FieldSpec("billing_period", "Billing period", "text")])
        self.assertEqual(values(fields), {"billing_period": "13-08-2026"})

    UNIT_SPECS = [
        FieldSpec("consumption", "Consumption", "number"),
        FieldSpec("unit", "Unit", "unit"),
    ]

    def test_unit_is_implied_kwh_at_low_confidence_when_the_bill_prints_none(self):
        lines = [line("UNITS ADVANCED:", 28, 399, 93, 412), line("141", 151, 401, 165, 411)]
        unit = extract_fields(lines, self.UNIT_SPECS)[1]
        self.assertEqual((unit.value, unit.confidence), ("kWh", 60.0))
        self.assertEqual(unit.source["method"], "implied_by_label")
        # Below the threshold, so the person has to acknowledge it.
        self.assertEqual(fields_needing_attention([unit], self.UNIT_SPECS[1:], 80), ["unit"])

    def test_printed_unit_beats_the_implied_one(self):
        lines = [line("UNITS ADVANCED:", 28, 399, 93, 412), line("141 MWh", 151, 401, 220, 411)]
        self.assertEqual(extract_fields(lines, self.UNIT_SPECS)[1].value, "MWh")

    def test_unit_is_not_implied_from_a_plain_consumption_label(self):
        lines = [line("Consumption:", 28, 399, 93, 412), line("141", 151, 401, 165, 411)]
        self.assertIsNone(extract_fields(lines, self.UNIT_SPECS)[1].value)

    SOURCE_SPEC = [FieldSpec("source_classification", "Source classification", "text", False)]

    def test_source_is_the_utility_named_on_the_bill(self):
        lines = [line("ELECTRICITY BILL", 215, 42), line("TPCODL", 242, 24, score=0.99)]
        source = extract_fields(lines, self.SOURCE_SPEC)[0]
        self.assertEqual((source.value, source.confidence), ("TPCODL", 99.0))

    def test_source_through_the_o_for_d_misread_is_capped_for_review(self):
        source = extract_fields([line("TPCOOL", 242, 24, score=0.99)], self.SOURCE_SPEC)[0]
        self.assertEqual((source.value, source.confidence), ("TPCODL", 70.0))
        self.assertEqual(
            fields_needing_attention([source], self.SOURCE_SPEC, 80), ["source_classification"]
        )

    def test_source_label_beats_the_utility_name_and_unknown_names_are_ignored(self):
        lines = [line("TPCODL", 242, 24), line("Energy source: Solar", 10, 100)]
        self.assertEqual(extract_fields(lines, self.SOURCE_SPEC)[0].value, "Solar")
        self.assertIsNone(extract_fields([line("ACME POWER LTD", 5, 5)], self.SOURCE_SPEC)[0].value)

    def test_utility_name_is_matched_as_a_whole_word(self):
        self.assertIsNone(extract_fields([line("XCESCX", 5, 5)], self.SOURCE_SPEC)[0].value)

    WATER_SPECS = [
        FieldSpec("withdrawal", "Water withdrawn", "number"),
        FieldSpec("discharge", "Water discharged", "number"),
        FieldSpec("unit", "Unit", "unit"),
    ]

    def test_water_bill_consumption_is_read_as_withdrawal_and_discharge_stays_empty(self):
        lines = [
            line("Previous reading: 1180", 10, 100),
            line("Consumption (KL):", 10, 130, 140, 150),
            line("25", 150, 131, 170, 150),
        ]
        got = extract_fields(lines, self.WATER_SPECS)
        self.assertEqual(values(got), {"withdrawal": "25", "discharge": None, "unit": "KL"})

    def test_water_consumption_label_ignores_average_and_rate_lines(self):
        lines = [
            line("Average consumption: 40", 10, 100),
            line("Consumption rate: 12", 10, 120),
            line("Water consumed 31 kilolitres", 10, 140),
        ]
        got = extract_fields(lines, self.WATER_SPECS)
        self.assertEqual(values(got), {"withdrawal": "31", "discharge": None, "unit": "kilolitres"})

    def test_an_explicit_withdrawal_label_beats_the_consumption_label(self):
        lines = [line("Consumption: 5", 10, 100), line("Water withdrawn: 90", 10, 120)]
        self.assertEqual(extract_fields(lines, self.WATER_SPECS)[0].value, "90")

    def test_safety_statement_counts_each_under_its_own_label(self):
        specs = [
            FieldSpec("person_hours", "Person-hours worked", "number"),
            FieldSpec("lost_time_injuries", "Lost time injuries", "number"),
            FieldSpec("recordable_injuries", "Total recordable work-related injuries", "number"),
            FieldSpec("fatalities", "Fatalities", "number"),
            FieldSpec("high_consequence_injuries", "High consequence injuries", "number"),
            FieldSpec("billing_period", "Statement period", "text"),
        ]
        lines = [
            line("SAFETY INCIDENT STATEMENT", 60, 170),
            line("Statement Period:", 60, 280),
            line("01-Sep-2026 to 30-Sep-2026", 560, 280),
            line("Person-hours Worked:", 60, 400),
            line("2,40,000", 560, 400),
            line("Lost Time Injuries:", 60, 460),
            line("1", 560, 460),
            line("Recordable Injuries:", 60, 520),
            line("3", 560, 520),
            line("Fatalities:", 60, 580),
            line("0", 560, 580),
            line("High Consequence Injuries:", 60, 640),
            line("2", 560, 640),
        ]
        self.assertEqual(
            values(extract_fields(lines, specs)),
            {
                "person_hours": "240000",
                "lost_time_injuries": "1",
                "recordable_injuries": "3",
                "fatalities": "0",
                "high_consequence_injuries": "2",
                "billing_period": "01-Sep-2026 to 30-Sep-2026",
            },
        )
        self.assertEqual(
            classify(lines, {"SAFETY_INCIDENT_STATEMENT": "a", "TRAINING_RECORD": "b"})[0],
            "SAFETY_INCIDENT_STATEMENT",
        )


TRAVEL_FIELDS = [
    FieldSpec("distance", "Distance of the journey", "number"),
    FieldSpec("passengers", "Passengers", "number"),
    FieldSpec("unit", "Unit", "unit"),
    FieldSpec("invoice_number", "PNR / ticket number", "text"),
]


PERIOD = [FieldSpec("billing_period", "Date", "text")]


class TravelTicketTest(unittest.TestCase):
    def test_printed_count_and_distance_are_read(self):
        lines = [
            line("PNR No: X7K2LQ", 60, 100),
            line("No. of Passengers:", 60, 160),
            line("6", 560, 160),
            line("Distance: 1,150 km", 60, 220),
        ]
        got = {f.key: f for f in extract_fields(lines, TRAVEL_FIELDS)}
        self.assertEqual(got["passengers"].value, "6")
        self.assertEqual(got["distance"].value, "1150")
        self.assertEqual(got["unit"].value, "km")
        self.assertEqual(got["invoice_number"].value, "X7K2LQ")

    def test_numbered_names_are_counted_below_the_review_threshold(self):
        lines = [
            line("Date of Travel: 12-Sep-2026", 60, 60),
            line("HYD - DEL  6E 2031", 60, 100),
            line("Passengers", 60, 160),
            line("1. MR A KUMAR", 60, 200),
            line("2. MS B RAO", 60, 240),
            line("3) MSTR C RAO", 60, 280),
            line("4 MRS D SINGH", 60, 320),
            line("Passenger 5: E JOSHI", 60, 360),
            line("Passenger 6: F KHAN", 60, 400),
        ]
        got = {f.key: f for f in extract_fields(lines, TRAVEL_FIELDS + PERIOD)}
        self.assertEqual(got["billing_period"].value, "12-Sep-2026")
        # The "Passengers" heading must not read the first name's "1" as the count.
        self.assertEqual(got["passengers"].value, "6")
        self.assertEqual(got["passengers"].source["method"], "counted_names")
        self.assertLessEqual(got["passengers"].confidence, 70)
        # No distance on the ticket: left for the person, never guessed.
        self.assertIsNone(got["distance"].value)

    def test_no_names_and_no_count_leaves_passengers_empty(self):
        lines = [line("Fare: 5400", 60, 100), line("Seat 12A", 60, 160)]
        got = {f.key: f for f in extract_fields(lines, TRAVEL_FIELDS)}
        self.assertIsNone(got["passengers"].value)


if __name__ == "__main__":
    unittest.main()
