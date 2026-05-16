"""Parse ExtractedRow objects into a HealthReport with normalized parameters,
status flags (low/normal/high/critical), and a critical_flags list.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from src.upload.pdf_extractor import ExtractedDoc, ExtractedRow

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
REF_RANGES_PATH = DATA_DIR / "reference-ranges" / "lab_reference_ranges.json"
CRITICAL_PATH = DATA_DIR / "critical-values" / "critical_thresholds.json"


@dataclass
class ParsedParameter:
    canonical_name: str
    value: float
    unit: str
    status: str  # "normal" | "low" | "high" | "critical_low" | "critical_high" | "unknown"
    ref_range: str = ""
    raw_name: str = ""

    def to_dict(self) -> dict:
        return {
            "canonical_name": self.canonical_name,
            "value": self.value,
            "unit": self.unit,
            "status": self.status,
            "ref_range": self.ref_range,
            "raw_name": self.raw_name,
        }


@dataclass
class CriticalFlag:
    parameter: str
    value: float
    unit: str
    threshold: float
    threshold_kind: str  # "high" | "low"
    severity: str
    action: str

    def to_dict(self) -> dict:
        return self.__dict__


@dataclass
class HealthReport:
    parameters: dict[str, ParsedParameter] = field(default_factory=dict)
    critical_flags: list[CriticalFlag] = field(default_factory=list)
    summary: str = ""
    report_type: str = "blood_test"
    patient_info: dict = field(default_factory=dict)

    def to_jsonable(self) -> dict:
        return {
            "report_type": self.report_type,
            "patient_info": self.patient_info,
            "parameters": {k: v.to_dict() for k, v in self.parameters.items()},
            "critical_flags": [f.to_dict() for f in self.critical_flags],
            "summary": self.summary,
        }


_NUMERIC_RE = re.compile(r"-?\d+\.?\d*")


def _parse_value(raw_value: str) -> Optional[float]:
    if not raw_value:
        return None
    cleaned = raw_value.replace(",", "")
    m = _NUMERIC_RE.search(cleaned)
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


_PATIENT_AGE_RE = re.compile(r"\bage[:\s]+(\d{1,3})", re.I)
_PATIENT_GENDER_RE = re.compile(r"\bsex[:\s]+(male|female|m|f)\b", re.I)


class LabReportParser:
    def __init__(self):
        self.reference_ranges = self._load_json(REF_RANGES_PATH)
        self.critical_thresholds = self._load_json(CRITICAL_PATH)
        self.alias_to_canonical = self._build_alias_index()

    @staticmethod
    def _load_json(path: Path) -> dict:
        if not path.exists():
            return {}
        return json.loads(path.read_text())

    def _build_alias_index(self) -> dict[str, str]:
        idx: dict[str, str] = {}
        for canonical, cfg in self.reference_ranges.items():
            idx[canonical.replace("_", " ")] = canonical
            idx[canonical] = canonical
            for alias in cfg.get("aliases", []):
                idx[alias.lower()] = canonical
        return idx

    def normalize_parameter_name(self, raw_name: str) -> Optional[str]:
        if not raw_name:
            return None
        cleaned = re.sub(r"[\s_\-.]+", " ", raw_name.lower()).strip()
        cleaned = re.sub(r"\(.*?\)", "", cleaned).strip()  # drop parenthetical
        # Direct lookup
        if cleaned in self.alias_to_canonical:
            return self.alias_to_canonical[cleaned]
        # Substring match against aliases (longer aliases first to avoid false positives)
        for alias in sorted(self.alias_to_canonical, key=len, reverse=True):
            if alias and alias in cleaned:
                return self.alias_to_canonical[alias]
        return None

    def _profile_for(self, canonical_name: str, patient_info: dict) -> dict:
        cfg = self.reference_ranges.get(canonical_name, {})
        ranges = cfg.get("ranges", {})
        # Prefer demographic-specific ranges if we know them.
        gender = patient_info.get("gender", "").lower()
        if gender == "male" and "adult_male" in ranges:
            return ranges["adult_male"]
        if gender == "female" and "adult_female" in ranges:
            return ranges["adult_female"]
        return ranges.get("default", next(iter(ranges.values()), {"low": None, "high": None}))

    def _classify(self, value: float, canonical_name: str, profile: dict) -> str:
        crit = self.critical_thresholds.get(canonical_name) or {}
        if "critical_high" in crit and value >= crit["critical_high"]:
            return "critical_high"
        if "critical_low" in crit and value <= crit["critical_low"]:
            return "critical_low"
        low = profile.get("low")
        high = profile.get("high")
        if low is not None and value < low:
            return "low"
        if high is not None and value > high:
            return "high"
        return "normal"

    def _extract_patient_info(self, raw_text: str) -> dict:
        info: dict = {}
        m = _PATIENT_AGE_RE.search(raw_text or "")
        if m:
            try:
                info["age"] = int(m.group(1))
            except ValueError:
                pass
        m = _PATIENT_GENDER_RE.search(raw_text or "")
        if m:
            g = m.group(1).lower()
            info["gender"] = "male" if g.startswith("m") else "female"
        return info

    def parse(self, extracted: ExtractedDoc) -> HealthReport:
        report = HealthReport()
        report.patient_info = self._extract_patient_info(extracted.text)

        rows = list(extracted.rows)
        # Fallback: if no structured rows, try regex over the text
        if not rows:
            rows = self._rows_from_text(extracted.text)

        for row in rows:
            canonical = self.normalize_parameter_name(row.raw_name)
            if not canonical:
                continue
            value = _parse_value(row.raw_value)
            if value is None:
                continue
            cfg = self.reference_ranges.get(canonical, {})
            unit = row.raw_unit or cfg.get("unit", "")
            profile = self._profile_for(canonical, report.patient_info)
            status = self._classify(value, canonical, profile)
            ref_str = f"{profile.get('low', '?')} - {profile.get('high', '?')}"
            report.parameters[canonical] = ParsedParameter(
                canonical_name=canonical,
                value=value,
                unit=unit,
                status=status,
                ref_range=ref_str,
                raw_name=row.raw_name,
            )
            if status.startswith("critical_"):
                crit = self.critical_thresholds.get(canonical, {})
                kind = "high" if status == "critical_high" else "low"
                report.critical_flags.append(
                    CriticalFlag(
                        parameter=canonical,
                        value=value,
                        unit=unit,
                        threshold=crit.get(f"critical_{kind}", 0.0),
                        threshold_kind=kind,
                        severity=crit.get("severity", "critical"),
                        action=crit.get("action", "Please seek medical attention promptly."),
                    )
                )

        report.report_type = self._guess_report_type(report.parameters)
        report.summary = self._make_summary(report)
        return report

    def _rows_from_text(self, text: str) -> list[ExtractedRow]:
        """Last-resort regex parsing for PDFs where table detection fails.

        Looks for patterns like: "Hemoglobin   12.3 g/dL   13.0-17.5".
        """
        rows: list[ExtractedRow] = []
        line_re = re.compile(
            r"^([A-Za-z][\w \-/\.()]+?)\s{2,}([-\d\.,]+)\s*([a-zA-Z%/µ]+)?\s*([-\d\.\s–-]+)?\s*$",
            re.M,
        )
        for m in line_re.finditer(text or ""):
            rows.append(
                ExtractedRow(
                    raw_name=m.group(1).strip(),
                    raw_value=m.group(2).strip(),
                    raw_unit=(m.group(3) or "").strip(),
                    raw_reference=(m.group(4) or "").strip(),
                )
            )
        return rows

    def _guess_report_type(self, params: dict[str, ParsedParameter]) -> str:
        names = set(params.keys())
        if {"total_cholesterol", "ldl", "hdl", "triglycerides"} & names:
            return "lipid_panel"
        if {"tsh", "t3", "t4"} & names:
            return "thyroid_panel"
        if {"hba1c", "fasting_glucose"} & names:
            return "diabetes_panel"
        if {"alt", "ast", "alkaline_phosphatase", "bilirubin_total"} & names:
            return "liver_function"
        if {"creatinine", "blood_urea_nitrogen", "potassium", "sodium"} & names:
            return "kidney_function"
        if {"hemoglobin", "rbc", "wbc", "platelets"} & names:
            return "cbc"
        if names:
            return "blood_test"
        return "other"

    def _make_summary(self, report: HealthReport) -> str:
        total = len(report.parameters)
        abnormal = sum(1 for p in report.parameters.values() if p.status not in ("normal", "unknown"))
        crit = len(report.critical_flags)
        return f"{total} parameter(s) extracted, {abnormal} outside normal range, {crit} critical."
