import { FormEvent, useEffect, useRef } from "react";
import { Search, Stethoscope, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  personalized?: boolean;
  onRemovePersonalized?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function SearchBar({
  value,
  onChange,
  onSubmit,
  loading,
  personalized,
  onRemovePersonalized,
  placeholder = "Ask about symptoms, medicines, nutrition, lab values…",
  autoFocus,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [autoFocus]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim() || loading) return;
    onSubmit();
  };

  return (
    <form className="search-bar" onSubmit={submit}>
      <Search size={17} strokeWidth={2} style={{ color: "var(--text-tertiary)" }} />
      {personalized && (
        <span className="personalized-badge">
          <Stethoscope size={13} strokeWidth={2} />
          Personalized
          <button
            type="button"
            aria-label="Exit personalized mode"
            onClick={onRemovePersonalized}
          >
            <X size={12} strokeWidth={2} />
          </button>
        </span>
      )}
      <input
        ref={ref}
        aria-label="Search health guidelines"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
      />
      <button
        type="submit"
        className={`btn-primary${loading ? " loading" : ""}`}
        disabled={loading || !value.trim()}
      >
        {loading ? "Searching" : "Search"}
      </button>
    </form>
  );
}
