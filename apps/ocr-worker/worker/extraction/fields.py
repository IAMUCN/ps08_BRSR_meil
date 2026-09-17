"""Find configured fields in OCR text lines. A field that can't be found is returned with value None
— never guessed (Master Approach §12)."""

import re
from dataclasses import dataclass, field

from worker.extraction.profiles import (
    DOCUMENT_TYPE_KEYWORDS,
    FIELD_PROFILES,
    MIN_CLASSIFICATION_SCORE,
    Profile,
)


@dataclass(frozen=True)
class TextLine:
    text: str
    score: float  # recognition confidence, 0–1
    box: tuple[float, float, float, float]  # x0, y0, x1, y1
    page: int = 1


@dataclass(frozen=True)
class FieldSpec:
    """One `metric_field_requirements` row."""

    key: str
    label: str
    data_type: str


@dataclass(frozen=True)
class ExtractedField:
    key: str
    label: str
    value: str | None
    confidence: float | None  # 0–100
    source: dict = field(default_factory=dict)  # how it was found, for raw_output


_NUMBER = re.compile(r"(?<![\d.,])(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\d,]*\d)")
_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9/\-]*[A-Za-z0-9]")
_DATE = r"\d{1,2}[-/. ](?:\d{1,2}|[A-Za-z]{3,9})[-/. ]\d{2,4}"
_PERIOD_RANGE = re.compile(rf"({_DATE})\s*(?:to|till|until|-|–|—)\s*({_DATE})", re.IGNORECASE)
_SINGLE_DATE = re.compile(rf"({_DATE})")
_UNIT = re.compile(
    r"(?<![A-Za-z])(kwh|kvah|litres|liters|litre|liter|ltrs|ltr|kl|l)(?![A-Za-z])", re.IGNORECASE
)
_LEADING_SEPARATORS = re.compile(r"^[\s:.#\-–=|()]+")


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def _label_match(label: str, text: str) -> re.Match | None:
    pattern = r"(?<![a-z])" + r"\s*".join(re.escape(part) for part in label.split()) + r"(?![a-z])"
    return re.search(pattern, _normalize(text))


def _read_value(kind: str, text: str) -> str | None:
    if kind == "number":
        match = _NUMBER.search(text)
        return match.group(1).replace(",", "") if match else None
    if kind == "identifier":
        # First token of 3+ characters that contains a digit, e.g. SMP-INV-2026-0042.
        tokens = (t for t in _TOKEN.findall(text) if len(t) >= 3 and re.search(r"\d", t))
        return next(tokens, "").upper() or None
    if kind == "period":
        match = _PERIOD_RANGE.search(text)
        if match:
            return f"{match.group(1)} to {match.group(2)}"
        match = _SINGLE_DATE.search(text)
        return match.group(1) if match else None
    if kind == "unit":
        match = _UNIT.search(text)
        return match.group(1) if match else None
    value = _LEADING_SEPARATORS.sub("", text).strip()
    return value if re.search(r"[A-Za-z]", value) else None


def _height(line: TextLine) -> float:
    return max(line.box[3] - line.box[1], 1.0)


def _right_neighbor(lines: list[TextLine], i: int) -> int | None:
    """Nearest line to the right on the same row."""
    anchor = lines[i]
    best, best_gap = None, None
    for j, other in enumerate(lines):
        if j == i or other.page != anchor.page:
            continue
        overlap = min(anchor.box[3], other.box[3]) - max(anchor.box[1], other.box[1])
        if overlap < 0.5 * min(_height(anchor), _height(other)):
            continue
        gap = other.box[0] - anchor.box[2]
        if gap >= -5 and (best_gap is None or gap < best_gap):
            best, best_gap = j, gap
    return best


def _below_neighbor(lines: list[TextLine], i: int) -> int | None:
    """Nearest line directly below that overlaps horizontally (a table cell under its header)."""
    anchor = lines[i]
    best, best_gap = None, None
    for j, other in enumerate(lines):
        if j == i or other.page != anchor.page:
            continue
        gap = other.box[1] - anchor.box[3]
        if gap < -0.3 * _height(anchor) or gap > 3 * _height(anchor):
            continue
        if min(anchor.box[2], other.box[2]) - max(anchor.box[0], other.box[0]) <= 0:
            continue
        if best_gap is None or gap < best_gap:
            best, best_gap = j, gap
    return best


def _percent(*scores: float) -> float:
    return round(min(scores) * 100, 2)


def _find_labeled(lines: list[TextLine], profile: Profile) -> tuple[str, float, dict] | None:
    order = sorted(
        range(len(lines)), key=lambda k: (lines[k].page, lines[k].box[1], lines[k].box[0])
    )
    for label in profile.labels:
        for i in order:
            line = lines[i]
            match = _label_match(label, line.text)
            if not match or any(_label_match(word, line.text) for word in profile.exclude):
                continue
            # Same offsets as the normalized text (only case differs), keeping the original casing.
            remainder = re.sub(r"\s+", " ", line.text).strip()[match.end() :]
            value = _read_value(profile.kind, remainder)
            if value:
                return (
                    value,
                    _percent(line.score),
                    {"method": "same_line", "lines": [i], "label": label},
                )
            for neighbor, method in (
                (_right_neighbor(lines, i), "right"),
                (_below_neighbor(lines, i), "below"),
            ):
                if neighbor is None:
                    continue
                value = _read_value(profile.kind, lines[neighbor].text)
                if value:
                    return (
                        value,
                        _percent(line.score, lines[neighbor].score),
                        {"method": method, "lines": [i, neighbor], "label": label},
                    )
    return None


def _find_unit_near(lines: list[TextLine], found: dict[str, ExtractedField], profile: Profile):
    """A unit printed next to its quantity ("1,250.00 L") or in the quantity's label ("Qty
    (Litres)")."""
    for key in profile.near:
        anchor = found.get(key)
        if not anchor or not anchor.source.get("lines"):
            continue
        label_line, *rest = anchor.source["lines"]
        value_line = rest[0] if rest else label_line
        candidates = [value_line, _right_neighbor(lines, value_line), label_line]
        for position, i in enumerate(candidates):
            if i is None:
                continue
            text = lines[i].text
            if position == 0 and anchor.value:
                # Only look after the number, so unit-like noise before it is ignored.
                text = text.replace(",", "")
                number_at = text.find(anchor.value)
                text = text[number_at + len(anchor.value) :] if number_at >= 0 else text
            unit = _read_value("unit", text)
            if unit:
                return unit, _percent(lines[i].score), {"method": f"near_{key}", "lines": [i]}
    return None


def extract_fields(lines: list[TextLine], specs: list[FieldSpec]) -> list[ExtractedField]:
    found: dict[str, ExtractedField] = {}
    # Units depend on their quantity, so resolve fields with `near` last.
    ordered = sorted(specs, key=lambda s: bool(FIELD_PROFILES.get(s.key, Profile((), "text")).near))
    for spec in ordered:
        profile = FIELD_PROFILES.get(spec.key)
        hit = None
        if profile:
            hit = (
                _find_unit_near(lines, found, profile) if profile.near else None
            ) or _find_labeled(lines, profile)
        if hit:
            value, confidence, source = hit
            found[spec.key] = ExtractedField(spec.key, spec.label, value, confidence, source)
        else:
            reason = "no_rule_for_field" if not profile else "not_found"
            found[spec.key] = ExtractedField(spec.key, spec.label, None, None, {"method": reason})
    return [found[spec.key] for spec in specs]


def classify(
    lines: list[TextLine], candidates: dict[str, str]
) -> tuple[str | None, dict[str, int]]:
    """Pick a document type code among `candidates` ({code: id}) by distinct keyword hits."""
    text = _normalize(" ".join(line.text for line in lines))
    scores = {
        code: sum(1 for kw in DOCUMENT_TYPE_KEYWORDS.get(code, ()) if _label_match(kw, text))
        for code in candidates
    }
    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    if not ranked or ranked[0][1] < MIN_CLASSIFICATION_SCORE:
        return None, scores
    if len(ranked) > 1 and ranked[0][1] == ranked[1][1]:
        return None, scores
    return ranked[0][0], scores
