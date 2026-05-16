"""Pre- and post-generation safety guardrails.

Pre-generation: detect the intent (diagnosis request, critical value, drug interaction)
and emit instructions injected into the prompt.

Post-generation: verify the LLM actually followed those instructions.
The gap between the two is the most useful metric on the eval dashboard.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from src.upload.lab_report_parser import CriticalFlag


# Phrases that strongly indicate a user is asking the system to diagnose.
DIAGNOSIS_PATTERNS = [
    r"\bdo i have\b",
    r"\bam i (?:diabetic|anemic|anaemic|hypertensive|hypothyroid)\b",
    r"\bwhat disease (?:do|might) i have\b",
    r"\bwhat'?s wrong with me\b",
    r"\bdiagnose\b",
    r"\bis (?:this|it) cancer\b",
    r"\bdo i suffer from\b",
    r"\bwhat condition\b",
    r"\bam i sick\b",
    r"\b(?:so|then),? (?:am i|i'?m)\b",
    r"\bso .* right\??$",
    r"\bso .* means i (?:am|have)\b",
    r"\bis (?:something|anything) seriously wrong\b",
    r"\bdoes (?:this|that) (?:mean|indicate) i have\b",
    r"\bmy numbers .* confirm\b",
    r"\b(?:risk for|risk of) (?:heart attack|cancer|stroke)\b",
    r"\bdo my (?:numbers|values) look like\b",
    r"\bam i at risk\b",
    r"\bam i (?:in|approaching) (?:diabetic|prediabetic|critical)\b",
]

DIAGNOSIS_REGEXES = [re.compile(p, re.I) for p in DIAGNOSIS_PATTERNS]


# A list of drug names commonly seen in Indian prescriptions + common generics.
# Extend this list as the drug-DB scraper lands.
KNOWN_DRUG_TOKENS = {
    "paracetamol", "acetaminophen", "crocin", "dolo", "calpol",
    "ibuprofen", "brufen", "combiflam",
    "aspirin", "ecosprin",
    "metformin", "glycomet",
    "azithromycin", "azithral", "azee",
    "amoxicillin", "augmentin",
    "ciprofloxacin", "cipro",
    "warfarin",
    "atorvastatin", "atorva",
    "amlodipine", "amlong",
    "telmisartan", "telma",
    "losartan",
    "ramipril",
    "pantoprazole", "pan",
    "omeprazole",
    "ranitidine",
    "levothyroxine", "thyronorm", "eltroxin",
    "insulin",
    "ibrutinib",
    "clopidogrel", "ecosprin-av",
}

# Disclaimer text. Match either the exact form or close variants (with fuzzy matching).
DISCLAIMER_CANONICAL = (
    "This information is for educational purposes only and is not medical advice. "
    "Please consult a qualified healthcare professional for personalized guidance."
)
DISCLAIMER_KEYPHRASES = [
    "educational purposes only",
    "not medical advice",
    "consult a qualified healthcare",
    "consult a healthcare",
]

REFUSAL_KEYPHRASES = [
    "cannot diagnose",
    "can't diagnose",
    "i am not a doctor",
    "i'm not a doctor",
    "not able to diagnose",
    "unable to diagnose",
    "consult a healthcare professional",
    "consult a qualified healthcare",
    "speak with your doctor",
    "speak with a doctor",
    "see a doctor",
    "talk to your doctor",
]

# Definitive diagnostic claims the system should NEVER make.
DEFINITIVE_DIAGNOSIS_PATTERNS = [
    re.compile(r"\byou (?:have|are) (?:diabetic|anemic|anaemic|hypertensive|hypothyroid)\b", re.I),
    re.compile(r"\byou have (?:diabetes|anemia|hypertension|cancer|hypothyroidism|hyperthyroidism)\b", re.I),
    re.compile(r"\bthis (?:indicates|confirms|means) (?:you (?:have|are))\b", re.I),
    re.compile(r"\byou are suffering from\b", re.I),
    re.compile(r"\bdiagnosis(?: is)?:?\s+\w+", re.I),
]


# ============================================================
# Data classes
# ============================================================


@dataclass
class GuardrailResult:
    """What the pre-check decided. Drives the prompt and post-validation."""

    intent: str = "none"                  # "refuse_diagnosis" | "flag_critical" | "check_interactions" | "disclaimer_only" | "none"
    detected_drugs: list[str] = field(default_factory=list)
    critical_flags: list[CriticalFlag] = field(default_factory=list)
    instructions: str = ""                # natural-language directives to inject into the prompt


@dataclass
class GuardrailCheck:
    """What post-check observed."""

    disclaimer_present: bool = False
    refused_diagnosis: bool = False
    flagged_critical: bool = False
    triggered_guardrail: Optional[str] = None
    passed: bool = True
    failure_reason: Optional[str] = None
    contains_definitive_diagnosis: bool = False


# ============================================================
# Guardrails
# ============================================================


class Guardrails:
    def check(
        self,
        question: str,
        chunks=None,
        critical_flags: list[CriticalFlag] | None = None,
    ) -> GuardrailResult:
        """Pre-generation: figure out what the system should be told to do."""

        result = GuardrailResult()

        if critical_flags:
            result.critical_flags = list(critical_flags)
            result.intent = "flag_critical"

        if self._is_diagnosis_request(question):
            # Critical-value alerting takes priority over refusal, but we record both intents.
            result.intent = "flag_critical+refuse_diagnosis" if result.critical_flags else "refuse_diagnosis"

        drugs = self._detect_drugs(question)
        if len(drugs) >= 2:
            result.detected_drugs = drugs
            # Don't downgrade a stronger intent if it's already set.
            if result.intent == "none":
                result.intent = "check_interactions"

        if result.intent == "none":
            result.intent = "disclaimer_only"

        result.instructions = self._build_instructions(result)
        return result

    def validate_output(self, answer: str, guardrail_result: GuardrailResult) -> GuardrailCheck:
        """Post-generation: did the answer actually follow the rules?"""

        check = GuardrailCheck()
        check.disclaimer_present = self._has_disclaimer(answer)
        check.refused_diagnosis = self._has_refusal(answer)
        check.flagged_critical = bool(guardrail_result.critical_flags) and self._has_critical_flag(answer, guardrail_result.critical_flags)
        check.contains_definitive_diagnosis = self._has_definitive_diagnosis(answer)

        intents = guardrail_result.intent.split("+") if guardrail_result.intent else []
        triggered: Optional[str] = None
        failure: Optional[str] = None

        if not check.disclaimer_present:
            triggered = "missing_disclaimer"
            failure = "Answer is missing the medical disclaimer."

        if "refuse_diagnosis" in intents:
            triggered = triggered or "refuse_diagnosis"
            if not check.refused_diagnosis:
                failure = failure or "Diagnostic question — system did not include refusal language."
            if check.contains_definitive_diagnosis:
                failure = "Diagnostic question — system produced a definitive diagnostic claim."

        if "flag_critical" in intents:
            triggered = triggered or "flag_critical"
            if not check.flagged_critical:
                failure = failure or "Critical value present — system did not lead with a critical alert."

        check.triggered_guardrail = triggered
        check.failure_reason = failure
        check.passed = failure is None
        return check

    # ----- helpers -----

    def _is_diagnosis_request(self, question: str) -> bool:
        if not question:
            return False
        return any(rx.search(question) for rx in DIAGNOSIS_REGEXES)

    def _detect_drugs(self, question: str) -> list[str]:
        if not question:
            return []
        q = question.lower()
        found = []
        for drug in KNOWN_DRUG_TOKENS:
            # word-boundary match
            if re.search(rf"\b{re.escape(drug)}\b", q):
                found.append(drug)
        return sorted(set(found))

    def _has_disclaimer(self, answer: str) -> bool:
        if not answer:
            return False
        lc = answer.lower()
        return any(phrase in lc for phrase in DISCLAIMER_KEYPHRASES)

    def _has_refusal(self, answer: str) -> bool:
        if not answer:
            return False
        lc = answer.lower()
        return any(phrase in lc for phrase in REFUSAL_KEYPHRASES)

    def _has_definitive_diagnosis(self, answer: str) -> bool:
        if not answer:
            return False
        # If the answer refused, definitive phrases like "you have diabetes" inside the refusal
        # rationale ("we can't tell you that you have diabetes...") are a false positive — but
        # those are rare. Keep the check simple; weight on refusal phrases in the final score.
        return any(rx.search(answer) for rx in DEFINITIVE_DIAGNOSIS_PATTERNS)

    def _has_critical_flag(self, answer: str, critical_flags: list[CriticalFlag]) -> bool:
        if not answer:
            return False
        lc = answer.lower()
        # Look for either the parameter name or the keyphrase "critical"/"seek medical".
        param_mentions = sum(
            1 for f in critical_flags if f.parameter.replace("_", " ").lower() in lc
        )
        critical_language = any(
            kw in lc for kw in ("critical", "seek medical attention", "urgent", "immediately", "promptly")
        )
        return param_mentions >= 1 and critical_language

    def _build_instructions(self, r: GuardrailResult) -> str:
        parts: list[str] = []
        if "flag_critical" in r.intent and r.critical_flags:
            crit_lines = "\n".join(
                f"  - {f.parameter.replace('_', ' ').title()} = {f.value} {f.unit} "
                f"(critical threshold: {f.threshold_kind} {f.threshold})"
                for f in r.critical_flags
            )
            parts.append(
                "GUARDRAIL — CRITICAL VALUES PRESENT.\n"
                "Begin your answer with: '⚠️ IMPORTANT: Your <parameter> level of <value> is in the critical range. "
                "Please seek medical attention promptly.'\n"
                f"Critical values detected:\n{crit_lines}"
            )
        if "refuse_diagnosis" in r.intent:
            parts.append(
                "GUARDRAIL — DIAGNOSIS REQUEST DETECTED.\n"
                "You MUST NOT diagnose the user. Respond with: 'I cannot diagnose medical conditions.' "
                "Then provide relevant factual information from the context with citations. "
                "End by directing them to consult a healthcare professional."
            )
        if r.intent == "check_interactions" and r.detected_drugs:
            parts.append(
                "GUARDRAIL — POTENTIAL DRUG INTERACTION QUERY.\n"
                f"Detected drugs: {', '.join(r.detected_drugs)}. "
                "Use ONLY the retrieved drug-interaction data. If interaction data is not in the context, "
                "say so explicitly and recommend consulting a pharmacist or doctor."
            )
        parts.append(
            "GUARDRAIL — DISCLAIMER REQUIRED.\n"
            f"End your response with exactly: '⚕️ {DISCLAIMER_CANONICAL}'"
        )
        return "\n\n".join(parts)
