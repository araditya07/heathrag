import { FileUp } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const MAX_BYTES = 10 * 1024 * 1024;

export default function UploadZone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".pdf")) return "Only PDF files are accepted.";
    if (file.size > MAX_BYTES) return "File is larger than 10 MB.";
    return null;
  };

  const accept = useCallback(
    (file: File) => {
      const err = validate(file);
      if (err) {
        setError(err);
        setTimeout(() => setError(null), 5000);
        return;
      }
      setError(null);
      onFile(file);
    },
    [onFile]
  );

  return (
    <>
      <button
        type="button"
        className={`upload-zone${dragOver ? " drag-over" : ""}`}
        aria-label="Upload your lab report PDF for personalized answers"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer?.files?.[0];
          if (file) accept(file);
        }}
      >
        <FileUp size={20} strokeWidth={2} />
        <div style={{ flex: 1 }}>
          <div>Upload your lab report (PDF) for personalized answers</div>
          <div className="meta">Stays in your session · deleted in 24 h · max 10 MB</div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) accept(f);
            e.target.value = "";
          }}
        />
      </button>
      {error && <div className="upload-error" role="alert">{error}</div>}
    </>
  );
}
