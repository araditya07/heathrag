"""HealthContext — stores/retrieves a user's uploaded report and formats it for prompts.

Sessions are keyed by an opaque session_id (set client-side, e.g. a random UUID
stored in localStorage). Each session can have multiple uploaded reports — we
use the most recent one.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.config import supabase_admin
from src.upload.lab_report_parser import (
    CriticalFlag,
    HealthReport,
    LabReportParser,
    ParsedParameter,
)


# Loose topic → parameter mapping. Used to scope the health context shown to the LLM
# so we don't dump the entire report on unrelated questions.
TOPIC_KEYWORDS: dict[str, tuple[str, ...]] = {
    "diabetes": ("hba1c", "fasting_glucose", "random_glucose"),
    "blood sugar": ("hba1c", "fasting_glucose", "random_glucose"),
    "sugar": ("hba1c", "fasting_glucose", "random_glucose"),
    "cholesterol": ("total_cholesterol", "ldl", "hdl", "triglycerides"),
    "lipid": ("total_cholesterol", "ldl", "hdl", "triglycerides"),
    "heart": ("total_cholesterol", "ldl", "hdl", "triglycerides"),
    "anemia": ("hemoglobin", "rbc", "ferritin", "iron", "vitamin_b12"),
    "anaemic": ("hemoglobin", "rbc", "ferritin", "iron", "vitamin_b12"),
    "anemic": ("hemoglobin", "rbc", "ferritin", "iron", "vitamin_b12"),
    "hemoglobin": ("hemoglobin", "rbc"),
    "thyroid": ("tsh", "t3", "t4"),
    "tsh": ("tsh", "t3", "t4"),
    "kidney": ("creatinine", "blood_urea_nitrogen", "potassium", "sodium", "uric_acid"),
    "liver": ("alt", "ast", "alkaline_phosphatase", "bilirubin_total"),
    "vitamin d": ("vitamin_d",),
    "vitamin b12": ("vitamin_b12",),
    "potassium": ("potassium",),
    "sodium": ("sodium",),
    "platelets": ("platelets",),
    "wbc": ("wbc",),
    "uric": ("uric_acid",),
    "iron": ("iron", "ferritin"),
    "calcium": ("calcium",),
}


@dataclass
class HealthContextResult:
    has_context: bool = False
    formatted_context: str = ""
    parameters_used: list[str] = None  # type: ignore
    critical_flags: list[CriticalFlag] = None  # type: ignore

    def __post_init__(self):
        self.parameters_used = self.parameters_used or []
        self.critical_flags = self.critical_flags or []


class HealthContext:
    def __init__(self, session_id: str | None, supabase=None):
        self.session_id = session_id
        self.sb = supabase or supabase_admin()

    def latest_report(self) -> Optional[dict]:
        """Return the most-recent uploaded_health_reports row for this session."""
        if not self.session_id:
            return None
        res = (
            self.sb.table("uploaded_health_reports")
            .select("*")
            .eq("session_id", self.session_id)
            .order("uploaded_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        return rows[0] if rows else None

    def store_report(self, report: HealthReport, filename: str | None = None) -> str:
        """Insert a parsed report. Returns the new row's id."""
        payload = {
            "session_id": self.session_id or "anonymous",
            "report_type": report.report_type,
            "extracted_values": report.to_jsonable()["parameters"],
            "critical_flags": [f.to_dict() for f in report.critical_flags],
            "raw_text": None,
            "filename": filename,
        }
        res = self.sb.table("uploaded_health_reports").insert(payload).execute()
        return res.data[0]["id"] if res.data else ""

    def has_critical_values(self) -> bool:
        report = self.latest_report()
        if not report:
            return False
        return bool(report.get("critical_flags") or [])

    def critical_flags(self) -> list[dict]:
        report = self.latest_report()
        if not report:
            return []
        return list(report.get("critical_flags") or [])

    def context_for_query(self, question: str) -> HealthContextResult:
        """Return a HealthContextResult to inject into the prompt."""
        report_row = self.latest_report()
        if not report_row:
            return HealthContextResult(has_context=False)

        params: dict = report_row.get("extracted_values") or {}
        if not params:
            return HealthContextResult(has_context=False)

        relevant = self._select_relevant_parameters(question, params)
        critical_rows = report_row.get("critical_flags") or []
        critical_flags = [self._row_to_critical_flag(c) for c in critical_rows]

        formatted = self._format(relevant, critical_flags)
        return HealthContextResult(
            has_context=True,
            formatted_context=formatted,
            parameters_used=list(relevant.keys()),
            critical_flags=critical_flags,
        )

    @staticmethod
    def _row_to_critical_flag(d: dict) -> CriticalFlag:
        return CriticalFlag(
            parameter=d.get("parameter", ""),
            value=d.get("value", 0.0),
            unit=d.get("unit", ""),
            threshold=d.get("threshold", 0.0),
            threshold_kind=d.get("threshold_kind", "high"),
            severity=d.get("severity", "critical"),
            action=d.get("action", ""),
        )

    @staticmethod
    def _select_relevant_parameters(question: str, params: dict) -> dict:
        """Pick parameters that are likely relevant to the user's question."""
        q = question.lower()
        keys: set[str] = set()
        for keyword, names in TOPIC_KEYWORDS.items():
            if keyword in q:
                keys.update(names)

        # If the question references the report generically, include critical/abnormal results.
        generic_terms = ("my report", "my results", "my blood", "my values", "my lab")
        if any(t in q for t in generic_terms) or not keys:
            for name, p in params.items():
                if p.get("status") not in ("normal", "unknown"):
                    keys.add(name)
            # Cap to 10 to avoid drowning the prompt.
            if len(keys) > 10:
                keys = set(list(keys)[:10])

        return {k: params[k] for k in keys if k in params}

    @staticmethod
    def _format(relevant: dict, critical_flags: list[CriticalFlag]) -> str:
        if not relevant and not critical_flags:
            return ""
        lines: list[str] = []
        if critical_flags:
            lines.append("⚠ CRITICAL VALUES DETECTED:")
            for f in critical_flags:
                lines.append(
                    f"- {f.parameter.replace('_', ' ').title()}: {f.value} {f.unit} "
                    f"(critical {f.threshold_kind} threshold: {f.threshold}). {f.action}"
                )
            lines.append("")

        if relevant:
            lines.append("USER'S LAB RESULTS (from uploaded report):")
            for name, p in relevant.items():
                status = (p.get("status") or "").upper()
                lines.append(
                    f"- {name.replace('_', ' ').title()}: {p.get('value')} {p.get('unit', '')} "
                    f"(Reference: {p.get('ref_range', '?')}) → {status}"
                )
        return "\n".join(lines)


def parse_and_store(pdf_bytes: bytes, session_id: str, filename: str | None = None) -> dict:
    """End-to-end: bytes → ExtractedDoc → HealthReport → DB row.

    Returns a JSON-serializable dict the API can return to the frontend.
    """
    from src.upload.pdf_extractor import PDFExtractor

    extractor = PDFExtractor()
    parser = LabReportParser()
    extracted = extractor.extract(pdf_bytes)
    report = parser.parse(extracted)

    ctx = HealthContext(session_id=session_id)
    report_id = ctx.store_report(report, filename=filename)

    return {
        "report_id": report_id,
        "report_type": report.report_type,
        "summary": report.summary,
        "patient_info": report.patient_info,
        "parameters": {k: p.to_dict() for k, p in report.parameters.items()},
        "critical_flags": [f.to_dict() for f in report.critical_flags],
    }
