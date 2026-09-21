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


if __name__ == "__main__":
    unittest.main()
