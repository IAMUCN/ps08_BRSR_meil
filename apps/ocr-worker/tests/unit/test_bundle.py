"""Splitting a multi-bill PDF into proposed bills (no OCR engine, no database)."""

import unittest

from worker.extraction.bundle import propose_metric, split_pages
from worker.extraction.fields import TextLine

CANDIDATES = {
    code: code.lower()
    for code in (
        "ELECTRICITY_BILL",
        "DIESEL_INVOICE",
        "FUEL_INVOICE",
        "WATER_BILL",
    )
}
ELECTRICITY = ["TPCODL ELECTRICITY BILL", "METER NO 3003122071", "UNITS CONSUMED 141", "TARIFF DOM"]
DIESEL = ["TAX INVOICE", "HIGH SPEED DIESEL HSD", "QTY 500 LITRES"]
PETROL = ["TAX INVOICE", "PETROL MS", "QTY 40 LITRES", "FUEL"]
WATER = ["WATER BILL", "WATER SUPPLY", "METER READING 1180"]


def page(number, texts):
    return [
        TextLine(text, 0.95, (0, 10 * i, 100, 10 * i + 8), number) for i, text in enumerate(texts)
    ]


def lines(*pages):
    return [line for number, texts in enumerate(pages, start=1) for line in page(number, texts)]


def spans(parts):
    return [(p.page_from, p.page_to, p.document_type) for p in parts]


class SplitPagesTest(unittest.TestCase):
    def test_three_different_bills_become_three_parts(self):
        parts = split_pages(lines(ELECTRICITY, DIESEL, WATER), 3, CANDIDATES)
        self.assertEqual(
            spans(parts),
            [
                (1, 1, "ELECTRICITY_BILL"),
                (2, 2, "DIESEL_INVOICE"),
                (3, 3, "WATER_BILL"),
            ],
        )

    def test_a_page_that_names_nothing_stays_with_the_bill_before_it(self):
        parts = split_pages(lines(ELECTRICITY, ["page 2 of 2", "thank you"], DIESEL), 3, CANDIDATES)
        self.assertEqual(spans(parts), [(1, 2, "ELECTRICITY_BILL"), (3, 3, "DIESEL_INVOICE")])

    def test_a_second_page_of_the_same_type_extends_the_bill(self):
        parts = split_pages(lines(ELECTRICITY, ELECTRICITY, WATER), 3, CANDIDATES)
        self.assertEqual(spans(parts), [(1, 2, "ELECTRICITY_BILL"), (3, 3, "WATER_BILL")])

    def test_leading_pages_that_name_nothing_join_the_first_identified_bill(self):
        parts = split_pages(lines(["cover letter"], WATER), 2, CANDIDATES)
        self.assertEqual(spans(parts), [(1, 2, "WATER_BILL")])

    def test_nothing_identified_is_one_unidentified_part(self):
        parts = split_pages(lines(["hello"], ["world"]), 2, CANDIDATES)
        self.assertEqual(spans(parts), [(1, 2, None)])

    def test_a_petrol_bill_is_not_taken_for_diesel(self):
        parts = split_pages(lines(PETROL), 1, CANDIDATES)
        self.assertEqual(spans(parts), [(1, 1, "FUEL_INVOICE")])

    def test_a_blank_page_is_kept_with_the_previous_bill(self):
        parts = split_pages(lines(WATER, []), 2, CANDIDATES)
        self.assertEqual(spans(parts), [(1, 2, "WATER_BILL")])


class ProposeMetricTest(unittest.TestCase):
    FUELS = [("p", "Petrol Consumption"), ("c", "CNG Consumption"), ("l", "LPG Consumption")]

    def test_one_candidate_is_the_answer(self):
        self.assertEqual(propose_metric("anything", [("m", "Grid Electricity")]), "m")

    def test_the_word_only_one_metric_has_decides(self):
        self.assertEqual(propose_metric("Tax invoice CNG 12 kg", self.FUELS), "c")
        self.assertEqual(propose_metric("PETROL (MS) 40 litres", self.FUELS), "p")

    def test_no_distinguishing_word_leaves_it_to_the_person(self):
        self.assertIsNone(propose_metric("fuel invoice 40 litres", self.FUELS))

    def test_two_matching_words_leave_it_to_the_person(self):
        self.assertIsNone(propose_metric("petrol and lpg", self.FUELS))

    def test_no_candidates_is_none(self):
        self.assertIsNone(propose_metric("anything", []))


if __name__ == "__main__":
    unittest.main()
