import { FileText } from "lucide-react";
import { useEffect, useState } from "react";

const STEPS = [
  "Uploading file…",
  "Extracting text from PDF…",
  "Identifying lab parameters…",
  "Matching against reference ranges…",
  "Checking for critical values…",
];

export default function UploadProgress({ filename }: { filename: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [pct, setPct] = useState(8);

  useEffect(() => {
    let cancelled = false;
    let i = 0;
    const advance = () => {
      if (cancelled) return;
      i += 1;
      if (i >= STEPS.length) return;
      setStepIdx(i);
      setPct(Math.min(95, 15 + i * 20));
      const next = 700 + Math.random() * 300;
      setTimeout(advance, next);
    };
    const t = setTimeout(advance, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="upload-progress" aria-live="polite">
      <div className="filename">
        <FileText size={18} strokeWidth={2} />
        <span style={{ flex: 1 }}>{filename}</span>
        <span className="ds-mono" style={{ color: "var(--text-secondary)" }}>{pct}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="status">
        <span className="spin" />
        <span>{STEPS[stepIdx]}</span>
      </div>
    </div>
  );
}
