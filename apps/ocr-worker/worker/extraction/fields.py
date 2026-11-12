"""Find configured fields in OCR text lines. A field that can't be found is returned with value None
— never guessed (Master Approach §12)."""

import re
from dataclasses import dataclass, field

from worker.extraction.profiles import (
    DOCUMENT_TYPE_KEYWORDS,
    FIELD_PROFILES,
    FOLDED_UTILITY_CONFIDENCE,
    IMPLIED_UNIT,
    IMPLIED_UNIT_CONFIDENCE,
    IMPLIED_UNIT_LABELS,
    KNOWN_UTILITIES,
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
    required: bool = True


@dataclass(frozen=True)
class ExtractedField:
    key: str
    label: str
    value: str | None
    confidence: float | None  # 0–100
    source: dict = field(default_factory=dict)  # how it was found, for raw_output


def fields_needing_attention(
    fields: list[ExtractedField], specs: list[FieldSpec], threshold: float | None
) -> list[str]:
    """Found fields below the confidence threshold plus required fields that weren't found
    (.grill/phase-6-ocr-integration-decisions.md). With no threshold configured every found field
    counts — fail safe."""
    required = {s.key for s in specs if s.required}
    return [
        f.key
        for f in fields
        if (f.value is None and f.key in required)
        or (f.value is not None and (threshold is None or f.confidence < threshold))
    ]


_NUMBER = re.compile(r"(?<![\d.,])(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\d,]*\d)")
_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9/\-]*[A-Za-z0-9]")
_DATE = r"(?<!\d)\d{1,2}[-/. ](?:\d{1,2}|[A-Za-z]{3,9})[-/. ]\d{2,4}"
_PERIOD_RANGE = re.compile(rf"({_DATE})\s*(?:to|till|until|-|–|—)\s*({_DATE})", re.IGNORECASE)
_SINGLE_DATE = re.compile(rf"({_DATE})")
# A date run together with the meter reading in front of it, as OCR reads a photographed thermal
# bill ("PRES:7591.1201-04-2026" for "PRES:7591.12 01-04-2026"). Only at the end of a PREV/PRES
# line, and always below the review threshold: where the reading ends and the date begins is a
# guess the person checks.
_GLUED_READING_DATE = re.compile(r"\d[.,]\d{1,2}(\d{2}[-/.]\d{2}[-/.]\d{4})\s*$")
GLUED_DATE_CONFIDENCE = 0.60
_WHOLE_DATE = re.compile(rf"{_DATE}|\d{{4}}-\d{{2}}-\d{{2}}")
# Volume (incl. water in m³), energy, weight (Scope 3 waste) and currency (spend-based metrics).
_UNIT = re.compile(
    r"(?<![A-Za-z])"
    r"(kwh|kvah|mwh|kilolitres|kilolitre|litres|liters|litre|liter|ltrs|ltr|kl|l"
    r"|kilograms|kilogram|kgs|kg|tonnes|tonne|mt"
    r"|rupees|inr|rs|m3|m³|cubic metres"
    # Distance (travel in passenger-km) and piped gas in standard cubic metres.
    r"|kilometres|kilometers|kilometre|kilometer|kms|km|pkm|scm)"
    r"(?![A-Za-z])",
    re.IGNORECASE,
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
        # First token of 3+ characters that contains a digit, e.g. SMP-INV-2026-0042 — never a
        # date: a neighbouring line's date is not an invoice number, so the field stays empty for
        # the person to fill.
        tokens = (
            t
            for t in _TOKEN.findall(text)
            if len(t) >= 3 and re.search(r"\d", t) and not _WHOLE_DATE.fullmatch(t)
        )
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


def _date_on_same_row(lines: list[TextLine], i: int) -> int | None:
    """The first box to the right of line `i` on its row that holds a date. Unlike
    `_right_neighbor` it tolerates the label's box overlapping the date's, as on thermal bills."""
    anchor = lines[i]
    row = [
        j
        for j, other in enumerate(lines)
        if j != i
        and other.page == anchor.page
        and other.box[0] > anchor.box[0]
        and min(anchor.box[3], other.box[3]) - max(anchor.box[1], other.box[1])
        >= 0.5 * min(_height(anchor), _height(other))
        and _SINGLE_DATE.search(other.text)
    ]
    return min(row, key=lambda j: lines[j].box[0], default=None)


def _find_reading_period(lines: list[TextLine]) -> tuple[str, float, dict] | None:
    """DISCOM bills print no "billing period" label, only the meter readings ("PREV:5689
    11-07-2026", "PRES:5830 13-08-2026"; the date may be its own box to the right). The period is
    the previous reading date to the present reading date."""
    dates: dict[str, tuple[str, float, list[int]]] = {}
    for i, line in enumerate(lines):
        for label in ("prev", "pres"):
            match = _label_match(label, line.text)
            if not match or label in dates:
                continue
            remainder = re.sub(r"\s+", " ", line.text).strip()[match.end() :]
            date, score, used = _SINGLE_DATE.search(remainder), line.score, [i]
            if not date and (glued := _GLUED_READING_DATE.search(remainder)):
                date, score = glued, min(score, GLUED_DATE_CONFIDENCE)
            if not date and (j := _date_on_same_row(lines, i)) is not None:
                date, score, used = (
                    _SINGLE_DATE.search(lines[j].text),
                    min(score, lines[j].score),
                    [i, j],
                )
            if date:
                dates[label] = (date.group(1), score, used)
    if len(dates) < 2:
        return None
    (start, s_score, s_used), (end, e_score, e_used) = dates["prev"], dates["pres"]
    return (
        f"{start} to {end}",
        _percent(s_score, e_score),
        {"method": "meter_readings", "lines": s_used + e_used},
    )


def _find_implied_unit(found: dict[str, ExtractedField]) -> tuple[str, float, dict] | None:
    """kWh for a consumption read under a "units …" label when the bill prints no unit."""
    consumption = found.get("consumption")
    label = consumption.source.get("label") if consumption else None
    if consumption and consumption.value and label in IMPLIED_UNIT_LABELS:
        return (
            IMPLIED_UNIT,
            IMPLIED_UNIT_CONFIDENCE,
            {"method": "implied_by_label", "label": label, "lines": consumption.source["lines"]},
        )
    return None


def _find_utility(lines: list[TextLine]) -> tuple[str, float, dict] | None:
    """The first known electricity utility named on the page, topmost line first. OCR often reads
    the D of TPCODL as an O, so a name is also matched with D and O treated alike (then capped)."""
    order = sorted(
        range(len(lines)), key=lambda k: (lines[k].page, lines[k].box[1], lines[k].box[0])
    )
    for folded in (False, True):
        for i in order:
            text = re.sub(r"\s+", " ", lines[i].text.upper()).strip()
            text = text.replace("O", "D") if folded else text
            for name in KNOWN_UTILITIES:
                target = name.replace("O", "D") if folded else name
                pattern = (
                    r"(?<![A-Z0-9])" + r"\s*".join(map(re.escape, target.split())) + r"(?![A-Z0-9])"
                )
                if re.search(pattern, text):
                    confidence = _percent(lines[i].score)
                    if folded:
                        confidence = min(confidence, FOLDED_UTILITY_CONFIDENCE)
                    return name, confidence, {"method": "known_utility", "lines": [i]}
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
            if not hit and spec.key == "billing_period":
                hit = _find_reading_period(lines)
            if not hit and spec.key == "unit":
                hit = _find_implied_unit(found)
            if not hit and spec.key == "source_classification":
                hit = _find_utility(lines)
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


# --- Diagnostics (feature_enhancement.md Phase 3) ---------------------------------------------

# Fewer readable lines than this on a page: the picture itself is the problem, not the rules.
FEW_LINES = 15


def billing_period_diagnosis(lines: list[TextLine]) -> str:
    """Why no billing period was read, in words the person can act on. Never a guess at it."""
    readable = [ln for ln in lines if ln.text.strip()]
    if len(readable) < FEW_LINES:
        return (
            f"Only {len(readable)} lines of text could be read from this document, so the "
            "billing period could not be found. Retake the photo closer, flat and in focus, "
            "or type the period from the bill."
        )
    text = [_normalize(ln.text) for ln in readable]
    if any(_label_match("prev", t) or _label_match("pres", t) for t in text):
        return (
            "Meter readings (PREV / PRES) were found, but a reading date could not be read "
            "next to them. Type the billing period from the bill."
        )
    if any(
        _label_match(label, t)
        for t in text
        for label in ("billing period", "bill period", "bill month", "period", "from")
    ):
        return (
            "A billing-period label was found, but no dates could be read beside it. "
            "Type the billing period from the bill."
        )
    return (
        "No billing period, meter-reading dates or period label was found on this document. "
        "Type the billing period from the bill."
    )


# Another activity's document type must beat this record's own types by this many keywords before
# it is reported: a mismatch sends the record to a person, so only a clear one counts.
MISMATCH_MARGIN = 2


def detect_mismatch(lines: list[TextLine], own_codes: list[str]) -> dict | None:
    """The document type this looks like among every known type, when that is clearly not one of the
    record's own (Phase 3: the uploader may have picked the wrong activity)."""
    detected, scores = classify(lines, {code: code for code in DOCUMENT_TYPE_KEYWORDS})
    if detected is None or detected in own_codes:
        return None
    own_best = max((scores.get(code, 0) for code in own_codes), default=0)
    if scores[detected] - own_best < MISMATCH_MARGIN:
        return None
    return {"document_type": detected, "score": scores[detected], "own_best": own_best}
