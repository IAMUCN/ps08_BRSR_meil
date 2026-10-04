"""Propose how a multi-bill PDF splits into bills (.grill/multi-bill-pdf-decisions.md).

Pure rules, no database or OCR engine. The worker stores the result as a *proposal*; the uploader
confirms or edits it before any record exists. Each page is classified on its own among every
document type; a page that names a different type than the bill before it starts a new bill, and a
page that names none (a continuation, a blank back) stays with the bill before it.
"""

import re
from dataclasses import dataclass

from worker.extraction.fields import TextLine, classify

# Words that carry no information about *which* activity a metric is.
_WORD = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class BundlePart:
    page_from: int  # 1-based, inclusive
    page_to: int
    document_type: str | None  # a document type code, or None when no page named one
    scores: dict[str, int]  # keyword hits per type on the part's first identified page


def split_pages(
    lines: list[TextLine], pages_read: int, candidates: dict[str, str]
) -> list[BundlePart]:
    """Group pages 1..pages_read into consecutive bills. `candidates` is {type code: id}."""
    per_page: list[tuple[str | None, dict[str, int]]] = []
    for page in range(1, pages_read + 1):
        per_page.append(classify([ln for ln in lines if ln.page == page], candidates))

    parts: list[BundlePart] = []
    for page, (code, scores) in enumerate(per_page, start=1):
        if not parts:
            parts.append(BundlePart(page, page, code, scores))
            continue
        current = parts[-1]
        if code is None or code == current.document_type:
            parts[-1] = BundlePart(current.page_from, page, current.document_type, current.scores)
        elif current.document_type is None:
            # Leading pages that named nothing belong to the first bill that does.
            parts[-1] = BundlePart(current.page_from, page, code, scores)
        else:
            parts.append(BundlePart(page, page, code, scores))
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
