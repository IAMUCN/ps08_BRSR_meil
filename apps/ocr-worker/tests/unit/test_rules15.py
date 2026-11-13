"""rules-15 (role-wise dashboard capture, migration 0069): CSR beneficiaries, within-India
procurement and the fields of a compliance certificate."""

import unittest

from tests.unit.test_extraction import line
from worker.extraction.fields import FieldSpec, extract_fields
from worker.extraction.profiles import (
    DOCUMENT_TYPE_KEYWORDS,
    EXTRACTOR_VERSION,
    FIELD_PROFILES,
)


class VersionTest(unittest.TestCase):
    def test_the_rules_are_versioned(self):
        self.assertEqual(EXTRACTOR_VERSION, "rules-17")


class CapturedFieldsTest(unittest.TestCase):
    def test_csr_beneficiaries_are_read_beside_the_amount(self):
        lines = [
            line("Amount spent: 250000", 10, 10, 300, 30),
            line("Number of beneficiaries: 1,240", 10, 40, 300, 60),
        ]
        specs = [
            FieldSpec("amount", "Amount spent", "number"),
            FieldSpec("beneficiaries", "Number of beneficiaries", "number"),
        ]
        got = {f.key: f.value for f in extract_fields(lines, specs)}
        self.assertEqual(got["beneficiaries"], "1240")

    def test_within_india_spend_is_not_taken_from_the_msme_line(self):
        lines = [
            line("Total procurement: 9000000", 10, 10, 300, 30),
            line("Procured from MSMEs: 2500000", 10, 40, 300, 60),
            line("Procured from within India: 8400000", 10, 70, 300, 90),
        ]
        specs = [
            FieldSpec("msme_spend", "Procured from MSMEs", "number"),
            FieldSpec("india_spend", "Procured from within India", "number"),
        ]
        got = {f.key: f.value for f in extract_fields(lines, specs)}
        self.assertEqual(got["msme_spend"], "2500000")
        self.assertEqual(got["india_spend"], "8400000")

    def test_a_certificate_gives_its_number_authority_and_dates(self):
        lines = [
            line("Consent Order No: WMB/CTO/2023/4471", 10, 10, 400, 30),
            line("Issued by: State Pollution Control Board", 10, 40, 400, 60),
            line("Valid from: 01-04-2023", 10, 70, 400, 90),
            line("Valid upto: 31-03-2028", 10, 100, 400, 120),
        ]
        specs = [
            FieldSpec("certificate_number", "Certificate / consent number", "text"),
            FieldSpec("issuing_authority", "Issuing authority", "text"),
            FieldSpec("valid_from", "Valid from", "date"),
            FieldSpec("valid_to", "Valid until", "date"),
        ]
        got = {f.key: f.value for f in extract_fields(lines, specs)}
        self.assertEqual(got["valid_to"], "31-03-2028")
        self.assertEqual(got["valid_from"], "01-04-2023")
        self.assertIn("WMB/CTO/2023/4471", got["certificate_number"] or "")

    def test_validity_months_is_left_for_the_person(self):
        self.assertNotIn("validity_months", FIELD_PROFILES)
        lines = [line("Valid for 60 months", 10, 10, 300, 30)]
        got = extract_fields(lines, [FieldSpec("validity_months", "Validity (months)", "number")])
        self.assertIsNone(got[0].value)


class ClassificationTest(unittest.TestCase):
    def test_every_certificate_type_has_keywords(self):
        for code in (
            "CERTIFICATE_EXPIRY",
            "CONSENT_TO_OPERATE",
            "CONSENT_TO_ESTABLISH",
            "HAZARDOUS_WASTE_AUTH",
            "FIRE_NOC",
            "ISO_CERTIFICATE",
        ):
            self.assertGreaterEqual(len(DOCUMENT_TYPE_KEYWORDS[code]), 2, code)


if __name__ == "__main__":
    unittest.main()
