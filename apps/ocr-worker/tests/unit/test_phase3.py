"""rules-14 (feature_enhancement.md Phase 3): a meter-reading date run together with the reading,
the reason a billing period was not read, and a document that looks like another activity's."""

import unittest

from tests.unit.test_extraction import line
from worker.extraction.fields import (
    FieldSpec,
    billing_period_diagnosis,
    detect_mismatch,
    extract_fields,
)

PERIOD = [FieldSpec("billing_period", "Billing period", "text")]


class GluedReadingDateTest(unittest.TestCase):
    def test_a_date_run_together_with_the_reading_is_read_at_low_confidence(self):
        # As OCR read a photographed TPCODL bill on hosted (reading 7591.12, date 01-04-2026).
        lines = [
            line("PRES:7591.1201-04-2026", 51, 528, 230, 548),
            line("PREV:7094 01-03-2026", 51, 552, 230, 570),
        ]
        period = extract_fields(lines, PERIOD)[0]
        self.assertEqual(period.value, "01-03-2026 to 01-04-2026")
        # Below the review threshold (80): where the reading ends is a guess the person checks.
        self.assertEqual(period.confidence, 60.0)

    def test_only_on_meter_reading_lines(self):
        lines = [line("Bill date: 7591.1201-04-2026", 10, 10)]
        self.assertIsNone(extract_fields(lines, PERIOD)[0].value)

    def test_a_clean_reading_line_keeps_its_own_confidence(self):
        lines = [
            line("PRES:5830 13-08-2026", 51, 528, 182, 548, score=0.95),
            line("PREV:5689 11-07-2026", 51, 552, 182, 570, score=0.95),
        ]
        self.assertEqual(extract_fields(lines, PERIOD)[0].confidence, 95.0)


class DiagnosisTest(unittest.TestCase):
    def test_too_few_lines_asks_for_a_better_photo(self):
        self.assertIn("Retake the photo", billing_period_diagnosis([line("TPCODL", 1, 1)] * 4))

    def test_readings_without_dates_say_so(self):
        lines = [line("PRES:5830", 1, i * 20) for i in range(20)]
        self.assertIn("Meter readings (PREV / PRES) were found", billing_period_diagnosis(lines))

    def test_nothing_found_says_to_type_it(self):
        lines = [line(f"Line {i}", 1, i * 20) for i in range(20)]
        self.assertIn("No billing period", billing_period_diagnosis(lines))


class MismatchTest(unittest.TestCase):
    ELECTRICITY = [
        line("ELECTRICITY BILL", 1, 1),
        line("Units consumed 141 kWh", 1, 30),
        line("Energy charges", 1, 60),
        line("Meter No 1234", 1, 90),
    ]

    def test_an_electricity_bill_filed_as_diesel_is_reported(self):
        found = detect_mismatch(self.ELECTRICITY, ["DIESEL_INVOICE"])
        self.assertEqual(found["document_type"], "ELECTRICITY_BILL")

    def test_the_right_activity_is_not_reported(self):
        self.assertIsNone(detect_mismatch(self.ELECTRICITY, ["ELECTRICITY_BILL"]))

    def test_a_narrow_lead_is_not_enough(self):
        # Diesel and other fuels share words; one keyword more is not a clear mismatch.
        lines = [line("Fuel invoice", 1, 1), line("Diesel 100 litres", 1, 30)]
        self.assertIsNone(detect_mismatch(lines, ["FUEL_INVOICE"]))


if __name__ == "__main__":
    unittest.main()
