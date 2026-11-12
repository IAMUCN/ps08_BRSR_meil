"""Propose how a multi-bill PDF splits into bills (.grill/multi-bill-pdf-decisions.md).

Pure rules, no database or OCR engine. The worker stores the result as a *proposal*; the uploader
confirms or edits it before any record exists. Each page is classified on its own among every
document type, and its bill number, billing period and "Page x of y" marker are read. A page starts
a new bill when it says "Page 1 of", names a different type than the bill before it, or carries a
different bill number (or, with no bill number on either, a different billing period) — so two bills
of the same kind one after the other are told apart (owner's request, 2026-11-12). "Page 2 of 3",
a page that names nothing (a continuation, a blank back) and a page with the same identifiers stay
with the bill before it.
"""

import re
from dataclasses import dataclass

from worker.extraction.fields import FieldSpec, TextLine, classify, extract_fields

# Words that carry no information about *which* activity a metric is.
_WORD = re.compile(r"[a-z0-9]+")
# "Page 2 of 3", "Page 2/3", "Pg. 2 of 3".
_PAGE_OF = re.compile(r"\b(?:page|pg\.?)\s*(\d{1,3})\s*(?:of|/)\s*(\d{1,3})\b", re.IGNORECASE)
_IDENTIFIERS = [
    FieldSpec("invoice_number", "Bill number", "text", False),
    FieldSpec("billing_period", "Billing period", "text", False),
]


@dataclass(frozen=True)
class BundlePart:
    page_from: int  # 1-based, inclusive
    page_to: int
    document_type: str | None  # a document type code, or None when no page named one
    scores: dict[str, int]  # keyword hits per type on the part's first identified page
    bill_number: str | None = None  # the first one read on the bill's pages
    billing_period: str | None = None


def page_marker(lines: list[TextLine]) -> tuple[int, int] | None:
    """The page's "Page x of y", when it prints one that makes sense."""
    for line in lines:
        match = _PAGE_OF.search(line.text)
        if match:
            number, total = int(match.group(1)), int(match.group(2))
            if 1 <= number <= total:
                return number, total
    return None


def _same(a: str | None, b: str | None) -> bool:
    return re.sub(r"\s+", "", a or "").upper() == re.sub(r"\s+", "", b or "").upper()


def _identifiers(lines: list[TextLine]) -> tuple[str | None, str | None]:
    found = {f.key: f.value for f in extract_fields(lines, _IDENTIFIERS)}
    return found["invoice_number"], found["billing_period"]


def _starts_new_bill(
    current: BundlePart,
    code: str | None,
    marker: tuple[int, int] | None,
    bill_number: str | None,
    billing_period: str | None,
) -> bool:
    if marker:
        return marker[0] == 1
    if code is not None and current.document_type is not None and code != current.document_type:
        return True
    if bill_number and current.bill_number:
        return not _same(bill_number, current.bill_number)
    if bill_number or current.bill_number:
        # Only one side has a bill number: a continuation page rarely repeats it, so stay together.
        return False
    if billing_period and current.billing_period:
        return not _same(billing_period, current.billing_period)
    return False


def split_pages(
    lines: list[TextLine], pages_read: int, candidates: dict[str, str]
) -> list[BundlePart]:
    """Group pages 1..pages_read into consecutive bills. `candidates` is {type code: id}."""
    parts: list[BundlePart] = []
    for page in range(1, pages_read + 1):
        page_lines = [ln for ln in lines if ln.page == page]
        code, scores = classify(page_lines, candidates)
        marker = page_marker(page_lines)
        # "Page 3 of 5" on page 3 of a 5-page upload is the document's own numbering, printed across
        # several bills (a PDF footer), not the bill's: it says nothing about where a bill starts.
        if marker == (page, pages_read) and pages_read > 1:
            marker = None
        bill_number, billing_period = _identifiers(page_lines)
        if not parts or _starts_new_bill(parts[-1], code, marker, bill_number, billing_period):
            parts.append(BundlePart(page, page, code, scores, bill_number, billing_period))
            continue
        current = parts[-1]
        identified = current.document_type is None and code is not None
        parts[-1] = BundlePart(
            current.page_from,
            page,
            # Leading pages that named nothing belong to the first bill that does.
            code if identified else current.document_type,
            scores if identified else current.scores,
            current.bill_number or bill_number,
            current.billing_period or billing_period,
        )
    return parts


def _words(text: str) -> set[str]:
    return set(_WORD.findall(text.lower()))


def propose_metric(text: str, metrics: list[tuple[str, str]]) -> str | None:
    """The metric id this bill is for, among those its document type is mapped to (`metrics` is
    [(id, name)]). One candidate is the answer. Several (a fuel invoice for diesel, petrol, CNG or
    LPG) are told apart by the words only that metric's name has, found on the page; no match or
    more than one leaves the choice to the person."""
    if len(metrics) == 1:
        return metrics[0][0]
    page_words = _words(text)
    names = {metric_id: _words(name) for metric_id, name in metrics}
    matched = [
        metric_id
        for metric_id, words in names.items()
        if (words - set().union(*(w for other, w in names.items() if other != metric_id)))
        & page_words
    ]
    return matched[0] if len(matched) == 1 else None
