"""Extract text and tables from uploaded lab-report PDFs.

Indian lab reports (Thyrocare, Dr Lal PathLabs, SRL, Metropolis) are typically
formatted as tables: Test | Result | Unit | Reference Range | Flag. We extract
both raw text (as a fallback) and structured rows (preferred).
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import IO, Union

import pdfplumber


@dataclass
class ExtractedRow:
    """One parameter row pulled out of a lab report."""

    raw_name: str
    raw_value: str
    raw_unit: str = ""
    raw_reference: str = ""
    raw_flag: str = ""


@dataclass
class ExtractedDoc:
    text: str
    rows: list[ExtractedRow] = field(default_factory=list)
    page_count: int = 0


# Column header keywords we look for to identify a lab-results table.
TEST_NAME_KEYWORDS = ("test", "investigation", "parameter", "analyte", "name")
VALUE_KEYWORDS = ("result", "value", "observed", "obtained")
UNIT_KEYWORDS = ("unit", "units")
REF_KEYWORDS = ("reference", "range", "biological", "normal", "ref")
FLAG_KEYWORDS = ("flag", "status", "indication")


def _normalize(s: str) -> str:
    return (s or "").strip().lower()


def _match_column_indexes(header_row: list[str]) -> dict | None:
    """Given a row of header cells, return {name: idx, value: idx, ...} if it looks like a lab-results header."""
    cells = [_normalize(c) for c in header_row]
    if not any(c for c in cells):
        return None

    def find_col(keywords: tuple[str, ...]) -> int | None:
        for i, c in enumerate(cells):
            if any(kw in c for kw in keywords):
                return i
        return None

    name_idx = find_col(TEST_NAME_KEYWORDS)
    value_idx = find_col(VALUE_KEYWORDS)
    if name_idx is None or value_idx is None:
        return None
    return {
        "name": name_idx,
        "value": value_idx,
        "unit": find_col(UNIT_KEYWORDS),
        "reference": find_col(REF_KEYWORDS),
        "flag": find_col(FLAG_KEYWORDS),
    }


def _cell(row: list[str | None], idx: int | None) -> str:
    if idx is None:
        return ""
    if idx < 0 or idx >= len(row):
        return ""
    v = row[idx]
    return (v or "").strip()


class PDFExtractor:
    def extract(self, source: Union[str, bytes, IO[bytes]]) -> ExtractedDoc:
        """Extract text + structured rows from a PDF path, bytes, or file-like object."""
        if isinstance(source, (bytes, bytearray)):
            source = io.BytesIO(source)
        doc = ExtractedDoc(text="", rows=[])
        text_parts: list[str] = []
        with pdfplumber.open(source) as pdf:
            doc.page_count = len(pdf.pages)
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                if page_text:
                    text_parts.append(page_text)
                # Try table-based extraction
                try:
                    tables = page.extract_tables() or []
                except Exception:
                    tables = []
                for table in tables:
                    self._consume_table(table, doc.rows)
        doc.text = "\n".join(text_parts).strip()
        return doc

    def _consume_table(self, table: list[list[str | None]], out: list[ExtractedRow]):
        if not table or len(table) < 2:
            return
        # Find the header row (often the first row, but lab PDFs sometimes have
        # patient-info rows before the actual results header).
        header_idx = None
        col_map = None
        for i, row in enumerate(table[:5]):
            cells = [(c or "") for c in row]
            col_map = _match_column_indexes(cells)
            if col_map:
                header_idx = i
                break
        if col_map is None or header_idx is None:
            return
        for row in table[header_idx + 1 :]:
            row = [(c or "") for c in row]
            name = _cell(row, col_map["name"])
            value = _cell(row, col_map["value"])
            if not name or not value:
                continue
            out.append(
                ExtractedRow(
                    raw_name=name,
                    raw_value=value,
                    raw_unit=_cell(row, col_map.get("unit")),
                    raw_reference=_cell(row, col_map.get("reference")),
                    raw_flag=_cell(row, col_map.get("flag")),
                )
            )
