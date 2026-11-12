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


class SameKindBillsTest(unittest.TestCase):
    """Two bills of the same kind one after the other (owner's request, 2026-11-12)."""

    def bill(self, number, period="01-08-2026 to 31-08-2026", extra=()):
        return [*ELECTRICITY, f"BILL NO {number}", f"BILLING PERIOD {period}", *extra]

    def test_a_different_bill_number_starts_a_new_bill(self):
        parts = split_pages(lines(self.bill("TP-1001"), self.bill("TP-1002")), 2, CANDIDATES)
        self.assertEqual(spans(parts), [(1, 1, "ELECTRICITY_BILL"), (2, 2, "ELECTRICITY_BILL")])
        self.assertEqual([p.bill_number for p in parts], ["TP-1001", "TP-1002"])

    def test_the_same_bill_number_on_two_pages_is_one_bill(self):
        parts = split_pages(lines(self.bill("TP-1001"), self.bill("TP-1001")), 2, CANDIDATES)
        self.assertEqual(spans(parts), [(1, 2, "ELECTRICITY_BILL")])

    def test_without_bill_numbers_a_different_billing_period_starts_a_new_bill(self):
        aug = [*ELECTRICITY, "BILLING PERIOD 01-08-2026 to 31-08-2026"]
        sep = [*ELECTRICITY, "BILLING PERIOD 01-09-2026 to 30-09-2026"]
        parts = split_pages(lines(aug, sep, sep), 3, CANDIDATES)
        self.assertEqual(spans(parts), [(1, 1, "ELECTRICITY_BILL"), (2, 3, "ELECTRICITY_BILL")])
        self.assertEqual(parts[1].billing_period, "01-09-2026 to 30-09-2026")

    def test_page_markers_decide(self):
        first = self.bill("TP-1001", extra=["Page 1 of 2"])
        second = [*ELECTRICITY, "BILL NO TP-9999", "Page 2 of 2"]  # a misread number, same bill
        nxt = self.bill("TP-1002", extra=["Page 1 of 1"])
        parts = split_pages(lines(first, second, nxt), 3, CANDIDATES)
        self.assertEqual(spans(parts), [(1, 2, "ELECTRICITY_BILL"), (3, 3, "ELECTRICITY_BILL")])

    def test_a_continuation_page_without_the_number_stays(self):
        parts = split_pages(
            lines(self.bill("TP-1001"), ["Payment history", "Thank you"], self.bill("TP-1002")),
            3,
            CANDIDATES,
        )
        self.assertEqual(spans(parts), [(1, 2, "ELECTRICITY_BILL"), (3, 3, "ELECTRICITY_BILL")])

    def test_a_document_footer_does_not_join_bills_of_different_months(self):
        # Five monthly bills with a "Page k of 5" footer on every page (seen on hosted, 2026-11-12).
        pages = [self.bill(f"DEMO/2026/0{i}/00841", extra=[f"Page {i} of 5"]) for i in range(1, 6)]
        parts = split_pages(lines(*pages), 5, CANDIDATES)
        self.assertEqual([(p.page_from, p.page_to) for p in parts], [(i, i) for i in range(1, 6)])

    def test_one_bill_over_the_whole_document_stays_one(self):
        first = self.bill("TP-1001", extra=["Page 1 of 3"])
        parts = split_pages(
            lines(first, ["Charges", "Page 2 of 3"], ["Payment slip", "Page 3 of 3"]), 3, CANDIDATES
        )
        self.assertEqual(spans(parts), [(1, 3, "ELECTRICITY_BILL")])


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
