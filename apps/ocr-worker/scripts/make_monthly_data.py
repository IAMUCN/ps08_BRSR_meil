"""Write one folder of synthetic test data per month, April 2025 to October 2026.

    python scripts/make_monthly_data.py --out "../../test data" --feed "../../test data/_feed"

Each month folder ("April 2025", "May 2025", ...) is laid out like the earlier two sets:
one document per ESG activity for the projects in the app (in each role's folder a third
are single PDFs, a third images and the rest pages of one multi-bill PDF), a multi-bill
PDF for the small project, `manifest.csv` (what to upload where, by which role, and the
values printed) and `bills.json` (the same, one entry per bill, read by the feeding
script). `--feed` also gets every bill that sits inside a multi-bill PDF as its own
one-page PDF, so a script can upload every bill on its own.

The hierarchy is the one in the web app (`make_test_data.TREE_1`): nothing to import.
Quantities follow a gentle seasonal curve (`MONTHS`) so month-on-month charts have a
shape, and no month differs from the one before by enough to trip the anomaly check
(x2 or x0.5 of the median).

Everything is fictitious and watermarked SAMPLE.
"""

import argparse
import calendar
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import make_test_data as m  # noqa: E402
import pypdfium2 as pdfium  # noqa: E402

# (year, month, size of the month against the base).
# April 2025 to September 2026 are fed into the app;
# October 2026 is kept back for the demonstration.
MONTHS = [
    (2025, 4, 0.92),
    (2025, 5, 0.96),
    (2025, 6, 1.00),
    (2025, 7, 0.97),
    (2025, 8, 0.99),
    (2025, 9, 1.02),
    (2025, 10, 1.04),
    (2025, 11, 1.01),
    (2025, 12, 0.98),
    (2026, 1, 1.03),
    (2026, 2, 0.95),
    (2026, 3, 1.08),
    (2026, 4, 1.05),
    (2026, 5, 1.08),
    (2026, 6, 1.10),
    (2026, 7, 1.06),
    (2026, 8, 1.12),
    (2026, 9, 1.14),
    (2026, 10, 1.12),
]


def label_of(year: int, month: int) -> str:
    return f"{calendar.month_name[month]} {year}"


# What a bill prints (the generator's own keys) -> the field key the app asks for.
FIELD_KEYS = {
    "quantity": "quantity",
    "unit": "unit",
    "consumption": "consumption",
    "withdrawal": "withdrawal",
    "discharge": "discharge",
    "person_hours": "person_hours",
    "lost_time": "lost_time_injuries",
    "recordable": "recordable_injuries",
    "total": "total_employees",
    "women": "female_employees",
    "men": "male_employees",
    "trained": "trained_employees",
    "total_spend": "total_spend",
    "msme_spend": "msme_spend",
    "amount": "amount",
    "source": "source_classification",
}


def fields_of(metric: str, expected: dict, ref: str, period: str) -> dict:
    """The values the verify screen should hold, keyed as `metric_field_requirements` names them."""
    fields = {FIELD_KEYS[k]: str(v) for k, v in expected.items() if k in FIELD_KEYS}
    if metric == "WORKFORCE_TRAINING":  # "total" here is the headcount, "trained" those trained
        fields["total_employees"] = str(expected["total"])
    if metric.startswith("SAFETY_"):
        fields.update({"fatalities": "0", "high_consequence_injuries": "0"})
    if (
        metric not in ("WORKFORCE_GENDER", "WORKFORCE_TRAINING", "MSME_PROCUREMENT")
        and not metric.startswith("SAFETY_")
    ):
        fields["invoice_number"] = ref
    fields["billing_period"] = period
    return fields


def one_page(pdf: bytes, index: int) -> bytes:
    """Page `index` (0-based) of a PDF as a PDF of its own."""
    source = pdfium.PdfDocument(pdf)
    target = pdfium.PdfDocument.new()
    target.import_pages(source, [index])
    path = Path("_page.tmp.pdf")
    target.save(path)
    data = path.read_bytes()
    path.unlink()
    source.close()
    return data


def write_month(root: Path, feed: Path | None, year: int, month: int, factor: float) -> int:
    label = label_of(year, month)
    abbr = calendar.month_abbr[month]
    days = calendar.monthrange(year, month)[1]
    stamp = f"{abbr}-{year}"
    folder = root / label
    if folder.exists():
        for old in sorted(folder.rglob("*"), reverse=True):
            old.unlink() if old.is_file() else old.rmdir()
    submitting = [u for u in m.TREE_1 if u.scale]
    manifest: list[dict] = []
    bills: list[dict] = []
    seq = 0
    turn: dict[tuple[str, str], int] = {}
    held: dict[tuple[str, str], list[dict]] = {}
    image_count = 0

    def bill(unit, activity, expected, file_name, mime, feed_file, ref):
        return {
            "month": label,
            "unit": unit.name,
            "unit_code": unit.app_code,
            "role": m.ROLE_NAMES[activity.role],
            "metric": activity.metric,
            "activity": activity.name,
            "document_type": activity.doc_type,
            "expected": expected,
            "fields": fields_of(activity.metric, expected, ref, f"01-{stamp} to {days}-{stamp}"),
            "file": file_name,
            "mime": mime,
            "feed_file": feed_file,
        }

    def write_feed(name: str, data: bytes) -> str:
        assert feed is not None
        path = feed / label / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path.relative_to(feed.parent).as_posix()

    for unit in submitting:
        if unit.code == m.SMALL:
            continue
        for activity, build in m.ACTIVITIES:
            if not (activity.core or activity.home == unit.code):
                continue
            seq += 1
            ctx = {
                "unit": unit,
                "seq": seq,
                "k": unit.scale * factor,
                "ref": f"MEIL-{year}{month:02d}-{seq:03d}",
                "date": f"{10 + seq % 18:02d}-{stamp}",
                "end": f"{days}-{stamp}",
                "period": f"01-{stamp} to {days}-{stamp}",
            }
            data, expected = build(ctx)
            group = (unit.ref, activity.role)
            position = turn.get(group, 0)
            turn[group] = position + 1
            row = {
                "File": "",
                "Reporting period": label,
                "Org unit": unit.name,
                "Upload as role": m.ROLE_NAMES[activity.role],
                "ESG activity": activity.name,
                "Document type": activity.doc_type,
                "Values printed": "; ".join(f"{k}={v}" for k, v in expected.items()),
            }
            if position % 3 == 2:
                held.setdefault(group, []).append(
                    {
                        **row,
                        "data": data,
                        "unit": unit,
                        "activity": activity,
                        "expected": expected,
                        "ref": ctx["ref"],
                    }
                )
                continue
            extension, mime = "pdf", "application/pdf"
            if position % 3 == 1:
                image_count += 1
                extension = "jpg" if image_count % 2 else "png"
                data = m.as_image(data, "JPEG" if extension == "jpg" else "PNG")
                mime = "image/jpeg" if extension == "jpg" else "image/png"
            path = (
                Path("documents")
                / unit.ref
                / m.ROLE_NAMES[activity.role]
                / f"{seq:03d} {activity.metric}.{extension}"
            )
            (folder / path).parent.mkdir(parents=True, exist_ok=True)
            (folder / path).write_bytes(data)
            manifest.append({**row, "File": path.as_posix()})
            # A single document is uploaded from where it sits (paths relative to `--out`).
            bills.append(
                bill(
                    unit,
                    activity,
                    expected,
                    path.as_posix(),
                    mime,
                    f"{label}/{path.as_posix()}",
                    ctx["ref"],
                )
            )

    for (code, role), items in held.items():
        items = m.apart(items)
        single = len(items) == 1
        name = (
            f"{items[0]['ESG activity']}.pdf" if single else f"multi-bill ({len(items)} bills).pdf"
        )
        path = Path("documents") / code / m.ROLE_NAMES[role] / name
        data = items[0]["data"] if single else m.bundle([b["data"] for b in items])
        (folder / path).parent.mkdir(parents=True, exist_ok=True)
        (folder / path).write_bytes(data)
        first = {
            k: v
            for k, v in items[0].items()
            if k not in ("data", "unit", "activity", "expected", "ref")
        }
        if single:
            manifest.append({**first, "File": path.as_posix()})
        else:
            manifest.append(
                {
                    **first,
                    "File": path.as_posix(),
                    "ESG activity": 'choose "A PDF with several bills"',
                    "Document type": f"({len(items)} bills)",
                    "Values printed": " | ".join(
                        f"page {n}: {b['ESG activity']} ({b['Values printed']})"
                        for n, b in enumerate(items, 1)
                    ),
                }
            )
        for n, item in enumerate(items):
            entry = bill(
                item["unit"],
                item["activity"],
                item["expected"],
                path.as_posix(),
                "application/pdf",
                path.as_posix(),
                item["ref"],
            )
            entry["page"] = n + 1
            if feed is not None:
                entry["feed_file"] = write_feed(
                    f"{code} - {item['activity'].metric} (page {n + 1}).pdf",
                    one_page(data, n) if not single else data,
                )
            bills.append(entry)

    # One PDF holding three bills of different activities, all a Project Manager may upload.
    small = next(u for u in m.TREE_1 if u.code == m.SMALL)
    pages, kinds, entries = [], [], []
    for metric in ("DIESEL_CONSUMPTION", "GRID_ELECTRICITY", "PETROL_CONSUMPTION"):
        activity, build = next(a for a in m.ACTIVITIES if a[0].metric == metric)
        seq += 1
        ctx = {
            "unit": small,
            "seq": seq,
            "k": small.scale * factor,
            "ref": f"MEIL-{year}{month:02d}-{seq:03d}",
            "date": f"12-{stamp}",
            "end": f"{days}-{stamp}",
            "period": f"01-{stamp} to {days}-{stamp}",
        }
        data, expected = build(ctx)
        pages.append(data)
        entries.append((activity, expected, ctx["ref"]))
        kinds.append(
            f"page {len(pages)}: {activity.name} "
            f"({'; '.join(f'{k}={v}' for k, v in expected.items())})"
        )
    path = (
        Path("documents")
        / small.ref
        / m.ROLE_NAMES[m.PM]
        / "multi-bill (3 bills in one PDF).pdf"
    )
    (folder / path).parent.mkdir(parents=True, exist_ok=True)
    pdf = m.bundle(pages)
    (folder / path).write_bytes(pdf)
    manifest.append(
        {
            "File": path.as_posix(),
            "Reporting period": label,
            "Org unit": small.name,
            "Upload as role": m.ROLE_NAMES[m.PM],
            "ESG activity": 'choose "A PDF with several bills"',
            "Document type": "(3 bills)",
            "Values printed": " | ".join(kinds),
        }
    )
    for n, (activity, expected, ref) in enumerate(entries):
        entry = bill(
            small,
            activity,
            expected,
            path.as_posix(),
            "application/pdf",
            path.as_posix(),
            ref,
        )
        entry["page"] = n + 1
        if feed is not None:
            entry["feed_file"] = write_feed(
                f"{small.ref} - {activity.metric} (page {n + 1}).pdf", one_page(pdf, n)
            )
        bills.append(entry)

    with (folder / "manifest.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(manifest[0]))
        writer.writeheader()
        writer.writerows(manifest)
    (folder / "bills.json").write_text(json.dumps(bills, indent=1), encoding="utf-8")
    return len(bills)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default="test data")
    parser.add_argument("--feed", default="", help="also write each bill as its own file here")
    parser.add_argument("--only", default="", help="one month, e.g. 'October 2026'")
    args = parser.parse_args()
    feed = Path(args.feed) if args.feed else None
    for year, month, factor in MONTHS:
        label = label_of(year, month)
        if args.only and args.only != label:
            continue
        # October 2026 is for the demonstration: its bills are never fed by script.
        feed_target = None if (year, month) == (2026, 10) else feed
        count = write_month(Path(args.out), feed_target, year, month, factor)
        print(f"{label}: {count} bills", flush=True)


if __name__ == "__main__":
    main()
